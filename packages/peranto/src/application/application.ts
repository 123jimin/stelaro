import {join} from "node:path";

import type {Promisable} from "@jiminp/tooltool";

import type {AnyComponentContext} from "../component/context.ts";
import {consoleLoggerFactory, type Logger, type LoggerFactory} from "../component/logger.ts";
import type {
    AnyComponent,
    AnyComponentCallReference,
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
    ComponentId,
} from "../component/types.ts";
import {ConfigValidationError} from "../config/error.ts";
import {loadTomlConfig} from "../config/loader.ts";
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

export type ApplicationDefinition<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
> = {
    readonly components: TComponents;
    readonly logger?: LoggerFactory;
    readonly config?: TAppConfig;
    readonly onConfigReload?: () => Promisable<void>;
};

export type ApplicationOptions = {
    readonly config_dir?: string;
};

export type Application<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
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
};

type ComponentRuntime = {
    readonly component: AnyComponent;
    readonly id: ComponentId;
    readonly lifecycle: LifecycleMachine;
    readonly log: Logger;
    readonly callable_references: ReadonlySet<AnyComponentCallReference>;
    readonly state: unknown;
    config: unknown;
};

type DispatchFn = (reference: AnyComponentCallReference, input: unknown) => Promise<unknown>;

type DispatchEntry = {
    readonly runtime: ComponentRuntime;
    readonly handle: (context: AnyComponentContext, input: unknown) => Promisable<unknown>;
};

export function defineApplication<
    const TComponents extends readonly AnyComponent[],
    const TAppConfig extends ConfigSchema | undefined = undefined,
>(definition: ApplicationDefinition<TComponents, TAppConfig>): ApplicationDefinition<TComponents, TAppConfig> {
    return definition;
}

export function createApplication<
    const TComponents extends readonly AnyComponent[],
    const TAppConfig extends ConfigSchema | undefined = undefined,
>(definition: ApplicationDefinition<TComponents, TAppConfig>, options?: ApplicationOptions): Application<TComponents, TAppConfig> {
    const lifecycle = createLifecycleMachine();
    const config_dir = options?.config_dir ?? "config";
    const loggerFactory = definition.logger ?? consoleLoggerFactory;

    const ordered_components = validateAndSort(definition.components);
    const {runtimes, id_to_runtime, dispatchers} = buildRuntimes(ordered_components, loggerFactory);

    const dispatchCall: DispatchFn = async (reference, input) => {
        lifecycle.require(["active", "reloading"], "call");

        const entry = dispatchers.get(reference);
        if(entry == null) {
            throw new UnregisteredCallError(reference.component_id, reference.name);
        }
        entry.runtime.lifecycle.require(["active", "reloading"], "call");

        const context = buildContext(entry.runtime, dispatchCall);
        const result = await entry.handle(context, reference.input.assert(input));
        return reference.output.assert(result);
    };

    let app_config: unknown = null;

    const app: Application<TComponents, TAppConfig> = {
        get config() { return app_config as Application<TComponents, TAppConfig>["config"]; },
        async start(): Promise<void> {
            lifecycle.require("idle", "start");
            lifecycle.enter("starting");

            try {
                const config_loads: Promise<void>[] = [];
                if(definition.config != null) {
                    config_loads.push(
                        loadTomlConfig(join(config_dir, "application.toml"), definition.config)
                            .then((config) => { app_config = config; }),
                    );
                }
                for(const runtime of runtimes) {
                    if(runtime.component.config != null) {
                        config_loads.push(
                            loadTomlConfig(join(config_dir, `${runtime.id}.toml`), runtime.component.config, runtime.id)
                                .then((config) => { runtime.config = config; }),
                        );
                    }
                }
                await Promise.all(config_loads);

                for(const runtime of runtimes) {
                    runtime.lifecycle.enter("starting");
                    try {
                        if(runtime.component.start != null) {
                            const context = buildContext(runtime, dispatchCall);
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
                        const context = buildContext(runtime, dispatchCall);
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
                    config_loads.push(
                        loadTomlConfig(join(config_dir, "application.toml"), definition.config)
                            .then((config) => { pending_app_config = config; }),
                    );
                }
                for(const runtime of runtimes) {
                    if(runtime.component.config != null) {
                        config_loads.push(
                            loadTomlConfig(join(config_dir, `${runtime.id}.toml`), runtime.component.config, runtime.id)
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

            try {
                for(const runtime of runtimes) {
                    if(runtime.component.onConfigReload != null) {
                        const context = buildContext(runtime, dispatchCall);
                        await runtime.component.onConfigReload(context);
                    }
                }
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
                throw new ConfigValidationError(
                    join(config_dir, `${component_id}.toml`),
                    component_id,
                    new Error(`Component "${component_id}" does not declare a config schema.`),
                );
            }

            let pending_config: unknown;
            try {
                pending_config = await loadTomlConfig(
                    join(config_dir, `${runtime.id}.toml`),
                    runtime.component.config,
                    runtime.id,
                );
            } catch (error) {
                lifecycle.enter("active");
                throw error;
            }
            runtime.config = pending_config;

            try {
                if(runtime.component.onConfigReload != null) {
                    const context = buildContext(runtime, dispatchCall);
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
): AnyComponentContext {
    return {
        log: runtime.log,
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
