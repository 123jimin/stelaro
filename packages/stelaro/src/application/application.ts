import {join} from "node:path";

import type {Promisable} from "@jiminp/tooltool";

import type {AnyComponentContext} from "../component/context.ts";
import {consoleLoggerFactory, type Logger, type LoggerFactory} from "../component/logger.ts";
import {createDataAccess, type DataAccess} from "../data/data.ts";
import type {
    AnyComponent,
    AnyComponentCallReference,
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
    ComponentId,
} from "../component/types.ts";
import {loadTomlConfig, loadTomlSecrets} from "../config/loader.ts";
import type {ConfigSchema} from "../config/types.ts";
import {TopologicalCycleError, topologicalSort} from "../util/topological-sort.ts";
import {
    CircularDependencyError,
    DuplicateCallError,
    DuplicateComponentIdError,
    MissingDependencyError,
    MissingHandlerError,
    UndeclaredCallError,
    UnregisteredCallError,
    UnregisteredComponentError,
} from "./error.ts";
import {createLifecycleMachine, type LifecycleMachine} from "./lifecycle.ts";

export const FRAMEWORK_NAME = "stelaro";

/** @category Application */
export type ApplicationDefinition<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
    TAppSecrets extends ConfigSchema | undefined = undefined,
> = {
    readonly components: TComponents;
    readonly logger?: LoggerFactory;
    readonly config?: TAppConfig;
    readonly secrets?: TAppSecrets;
    readonly onConfigReload?: () => Promisable<void>;
};

/** @category Application */
export type ApplicationOptions = {
    readonly base_dir?: string;
    readonly env?: string | null;
};

/** @category Application */
export type Application<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
    TAppSecrets extends ConfigSchema | undefined = undefined,
> = {
    start(): Promise<void>;
    stop(): Promise<void>;
    call<TCall extends CallFrom<TComponents[number]["calls"]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
    reloadConfig(): Promise<void>;
    reloadComponentConfig(
        component_id: TComponents[number]["calls"]["id"],
    ): Promise<void>;
    readonly config: TAppConfig extends ConfigSchema ? TAppConfig["infer"] : null;
    readonly secrets: TAppSecrets extends ConfigSchema ? TAppSecrets["infer"] : null;
    readonly data: DataAccess;
    readonly logger: LoggerFactory;
};

type ComponentRuntime = {
    readonly component: AnyComponent;
    readonly id: ComponentId;
    readonly lifecycle: LifecycleMachine;
    readonly log: Logger;
    readonly callable_references: ReadonlySet<AnyComponentCallReference>;
    readonly state: unknown;
    config: unknown;
    secrets: unknown;
};

type DispatchFn = (reference: AnyComponentCallReference, input: unknown) => Promise<unknown>;

type DispatchEntry = {
    readonly runtime: ComponentRuntime;
    readonly handle: (context: AnyComponentContext, input: unknown) => Promisable<unknown>;
};

/** @category Application */
export function defineApplication<
    const TComponents extends readonly AnyComponent[],
    const TAppConfig extends ConfigSchema | undefined = undefined,
    const TAppSecrets extends ConfigSchema | undefined = undefined,
>(definition: ApplicationDefinition<TComponents, TAppConfig, TAppSecrets>): ApplicationDefinition<TComponents, TAppConfig, TAppSecrets> {
    return definition;
}

function tomlPaths(
    dir: string,
    stem: string,
    env: string | null,
): {base: string; overlay: string | null} {
    return {
        base: join(dir, `${stem}.toml`),
        overlay: env != null ? join(dir, `${stem}.${env}.toml`) : null,
    };
}

/** @category Application */
export function createApplication<
    const TComponents extends readonly AnyComponent[],
    const TAppConfig extends ConfigSchema | undefined = undefined,
    const TAppSecrets extends ConfigSchema | undefined = undefined,
>(definition: ApplicationDefinition<TComponents, TAppConfig, TAppSecrets>, options?: ApplicationOptions): Application<TComponents, TAppConfig, TAppSecrets> {
    const lifecycle = createLifecycleMachine();
    const base_dir = options?.base_dir ?? ".";
    const env = options?.env ?? null;
    const loggerFactory = definition.logger ?? consoleLoggerFactory;
    const framework_log = loggerFactory(FRAMEWORK_NAME);

    const ordered_components = validateAndSort(definition.components);
    const {runtimes, id_to_runtime, dispatchers} = buildRuntimes(ordered_components, loggerFactory);

    const dispatchCall: DispatchFn = async (reference, input) => {
        lifecycle.require(["active", "reloading"], "call");

        const entry = dispatchers.get(reference);
        if(entry == null) {
            throw new UnregisteredCallError(reference.component_id, reference.name);
        }
        entry.runtime.lifecycle.require(["active", "reloading"], "call");

        const context = buildContext(entry.runtime, dispatchCall, base_dir);
        const result = await entry.handle(context, reference.input.assert(input));
        return reference.output.assert(result);
    };

    let app_config: unknown = null;
    let app_secrets: unknown = null;

    const app: Application<TComponents, TAppConfig, TAppSecrets> = {
        get config() { return app_config as Application<TComponents, TAppConfig, TAppSecrets>["config"]; },
        get secrets() { return app_secrets as Application<TComponents, TAppConfig, TAppSecrets>["secrets"]; },
        data: createDataAccess(join(base_dir, "data")),
        logger: loggerFactory,
        async start(): Promise<void> {
            lifecycle.require("idle", "start");
            lifecycle.enter("starting");

            try {
                const loads: Promise<void>[] = [];

                if(definition.config != null) {
                    const {base, overlay} = tomlPaths(base_dir, "config", env);
                    loads.push(
                        loadTomlConfig(base, definition.config, null, overlay)
                            .then((config) => { app_config = config; }),
                    );
                }

                if(definition.secrets != null) {
                    const {base, overlay} = tomlPaths(base_dir, "secrets", env);
                    loads.push(
                        loadTomlSecrets(base, definition.secrets, null, overlay)
                            .then(({value, base_found}) => {
                                if(!base_found) {
                                    framework_log.warn(`No secrets file found for application: ${base}`);
                                }
                                app_secrets = value;
                            }),
                    );
                }

                for(const runtime of runtimes) {
                    const component_dir = join(base_dir, runtime.id);
                    if(runtime.component.config != null) {
                        const {base, overlay} = tomlPaths(component_dir, "config", env);
                        loads.push(
                            loadTomlConfig(base, runtime.component.config, runtime.id, overlay)
                                .then((config) => { runtime.config = config; }),
                        );
                    }
                    if(runtime.component.secrets != null) {
                        const {base, overlay} = tomlPaths(component_dir, "secrets", env);
                        loads.push(
                            loadTomlSecrets(base, runtime.component.secrets, runtime.id, overlay)
                                .then(({value, base_found}) => {
                                    if(!base_found) {
                                        runtime.log.warn(`No secrets file found: ${base}`);
                                    }
                                    runtime.secrets = value;
                                }),
                        );
                    }
                }

                await Promise.all(loads);

                for(const runtime of runtimes) {
                    runtime.lifecycle.enter("starting");
                    try {
                        if(runtime.component.start != null) {
                            const context = buildContext(runtime, dispatchCall, base_dir);
                            await runtime.component.start(context);
                        }
                        runtime.lifecycle.enter("active");
                    } catch (error) {
                        runtime.lifecycle.enter("failed");
                        throw error;
                    }
                }
            } catch (error) {
                lifecycle.enter("failed");
                throw error;
            }

            lifecycle.enter("active");
        },

        async stop(): Promise<void> {
            lifecycle.require(["active", "failed"], "stop");
            lifecycle.enter("stopping");

            const errors: unknown[] = [];

            for(let i = runtimes.length - 1; i >= 0; i--) {
                const runtime = runtimes[i]!;
                if(runtime.lifecycle.state !== "active") continue;

                runtime.lifecycle.enter("stopping");
                if(runtime.component.stop != null) {
                    try {
                        const context = buildContext(runtime, dispatchCall, base_dir);
                        await runtime.component.stop(context);
                    } catch (error) {
                        errors.push(error);
                    }
                }
                runtime.lifecycle.enter("idle");
            }

            lifecycle.enter("idle");

            if(errors.length > 0) {
                throw new AggregateError(errors, "One or more component stop hooks failed.");
            }
        },

        call<TCall extends CallFrom<TComponents[number]["calls"]>>(
            reference: TCall,
            input: CallInput<TCall>,
        ): Promise<CallOutput<TCall>> {
            return dispatchCall(reference, input) as Promise<CallOutput<TCall>>;
        },

        async reloadConfig(): Promise<void> {
            lifecycle.require("active", "reloadConfig");
            lifecycle.enter("reloading");

            let pending_app_config: unknown = null;
            const pending_component_configs = new Map<ComponentRuntime, unknown>();

            try {
                const config_loads: Promise<void>[] = [];
                if(definition.config != null) {
                    const {base, overlay} = tomlPaths(base_dir, "config", env);
                    config_loads.push(
                        loadTomlConfig(base, definition.config, null, overlay)
                            .then((config) => { pending_app_config = config; }),
                    );
                }
                for(const runtime of runtimes) {
                    if(runtime.component.config != null) {
                        const {base, overlay} = tomlPaths(join(base_dir, runtime.id), "config", env);
                        config_loads.push(
                            loadTomlConfig(base, runtime.component.config, runtime.id, overlay)
                                .then((config) => { pending_component_configs.set(runtime, config); }),
                        );
                    }
                }
                await Promise.all(config_loads);
            } catch (error) {
                lifecycle.enter("active");
                throw error;
            }

            if(definition.config != null) {
                app_config = pending_app_config;
            }
            for(const [runtime, config] of pending_component_configs) {
                runtime.config = config;
            }

            const results = await Promise.allSettled(runtimes.map(async (runtime) => {
                if(runtime.component.onConfigReload != null) {
                    const context = buildContext(runtime, dispatchCall, base_dir);
                    await runtime.component.onConfigReload(context);
                }
            }));
            const errors = results
                .filter((r): r is PromiseRejectedResult => r.status === "rejected")
                .map((r) => r.reason);

            if(errors.length > 0) {
                lifecycle.enter("failed");
                throw new AggregateError(errors, "One or more onConfigReload hooks failed.");
            }

            try {
                if(definition.onConfigReload != null) {
                    await definition.onConfigReload();
                }
            } catch (error) {
                lifecycle.enter("failed");
                throw error;
            }

            lifecycle.enter("active");
        },

        async reloadComponentConfig(
            component_id: TComponents[number]["calls"]["id"],
        ): Promise<void> {
            lifecycle.require("active", "reloadComponentConfig");
            lifecycle.enter("reloading");

            const runtime = id_to_runtime.get(component_id);
            if(runtime == null) {
                lifecycle.enter("active");
                throw new UnregisteredComponentError(component_id);
            }
            if(runtime.component.config == null) {
                lifecycle.enter("active");
                return;
            }

            let pending_config: unknown;
            try {
                const {base, overlay} = tomlPaths(join(base_dir, runtime.id), "config", env);
                pending_config = await loadTomlConfig(
                    base,
                    runtime.component.config,
                    runtime.id,
                    overlay,
                );
            } catch (error) {
                lifecycle.enter("active");
                throw error;
            }
            runtime.config = pending_config;

            try {
                if(runtime.component.onConfigReload != null) {
                    const context = buildContext(runtime, dispatchCall, base_dir);
                    await runtime.component.onConfigReload(context);
                }
            } catch (error) {
                lifecycle.enter("failed");
                throw error;
            }

            lifecycle.enter("active");
        },
    };

    return app;
}

function buildRuntimes(
    ordered_components: readonly AnyComponent[],
    loggerFactory: LoggerFactory,
): {
    runtimes: readonly ComponentRuntime[];
    id_to_runtime: ReadonlyMap<ComponentId, ComponentRuntime>;
    dispatchers: ReadonlyMap<AnyComponentCallReference, DispatchEntry>;
} {
    const runtimes: ComponentRuntime[] = [];
    const id_to_runtime = new Map<ComponentId, ComponentRuntime>();
    const dispatchers = new Map<AnyComponentCallReference, DispatchEntry>();

    for(const component of ordered_components) {
        const callable_references = new Set<AnyComponentCallReference>();
        for(const used_calls of component.uses) {
            for(const reference of Object.values(used_calls.calls)) {
                callable_references.add(reference);
            }
        }

        const runtime: ComponentRuntime = {
            component,
            id: component.calls.id,
            lifecycle: createLifecycleMachine(),
            log: loggerFactory(component.calls.id),
            callable_references,
            state: component.state != null ? component.state() : null,
            config: null,
            secrets: null,
        };

        runtimes.push(runtime);
        id_to_runtime.set(runtime.id, runtime);

        for(const [name, reference] of Object.entries(component.calls.calls)) {
            const handler = component.handlers[name];
            if(handler == null) {
                // unreachable after validateAndSort, kept as defensive check
                throw new MissingHandlerError(component.calls.id, name);
            }
            dispatchers.set(reference, {
                runtime,
                handle: (context, input) => handler.handle(context, input),
            });
        }
    }

    return {runtimes, id_to_runtime, dispatchers};
}

function buildContext(
    runtime: ComponentRuntime,
    dispatchCall: DispatchFn,
    base_dir: string,
): AnyComponentContext {
    return {
        log: runtime.log,
        data: createDataAccess(join(base_dir, runtime.id, "data")),
        call(reference: AnyComponentCallReference, input: unknown) {
            if(!runtime.callable_references.has(reference)) {
                throw new UndeclaredCallError(
                    runtime.id,
                    reference.component_id,
                    reference.name,
                );
            }
            return dispatchCall(reference, input);
        },
        ...(runtime.component.state != null ? {state: runtime.state} : null),
        ...(runtime.component.config != null ? {config: runtime.config} : null),
        ...(runtime.component.secrets != null ? {secrets: runtime.secrets} : null),
    };
}

function validateAndSort(components: readonly AnyComponent[]): readonly AnyComponent[] {
    const seen_ids = new Set<ComponentId>();
    const calls_to_component = new Map<AnyComponentCalls, AnyComponent>();
    const registered_call_keys = new Set<string>();
    const duplicate_call_keys = new Set<string>();

    for(const component of components) {
        if(seen_ids.has(component.calls.id)) {
            throw new DuplicateComponentIdError(component.calls.id);
        }
        seen_ids.add(component.calls.id);
        calls_to_component.set(component.calls, component);
    }

    for(const component of components) {
        for(const used_calls of component.uses) {
            if(!calls_to_component.has(used_calls)) {
                throw new MissingDependencyError(component.calls.id, used_calls.id);
            }
        }

        for(const [name, reference] of Object.entries(component.calls.calls)) {
            const key = `${reference.component_id}.${name}`;
            if(registered_call_keys.has(key)) {
                duplicate_call_keys.add(key);
            }
            registered_call_keys.add(key);

            if(component.handlers[name] == null) {
                throw new MissingHandlerError(component.calls.id, name);
            }
        }
    }

    if(duplicate_call_keys.size > 0) {
        throw new DuplicateCallError([...duplicate_call_keys]);
    }

    try {
        return topologicalSort(
            [...components],
            (component) => component.uses
                .map((used_calls) => calls_to_component.get(used_calls))
                .filter((dep): dep is AnyComponent => dep != null),
        );
    } catch (error) {
        if(error instanceof TopologicalCycleError) {
            const ids = (error.remaining as AnyComponent[]).map((c) => c.calls.id);
            throw new CircularDependencyError(ids);
        }
        throw error;
    }
}
