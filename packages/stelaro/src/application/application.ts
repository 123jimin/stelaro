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
import {loadTomlConfig, loadTomlSecrets} from "../config/loader.ts";
import type {ConfigSchema} from "../config/types.ts";
import {createDataAccess, type DataAccess} from "../data/data.ts";
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

/** Framework name used for the root logger.
 *
 * @category Application
 */
export const FRAMEWORK_NAME = "stelaro";

/**
 * Declarative definition of an application's components, schemas, and hooks.
 *
 * @typeParam TComponents - Tuple of registered components
 * @typeParam TAppConfig - Application-level config schema
 * @typeParam TAppSecrets - Application-level secrets schema
 * @category Application
 */
export type ApplicationDefinition<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
    TAppSecrets extends ConfigSchema | undefined = undefined,
> = {
    /** Components registered in this application */
    readonly components: TComponents;
    /** Custom logger factory (default: console) */
    readonly logger?: LoggerFactory;
    /** Application-level config schema */
    readonly config?: TAppConfig;
    /** Application-level secrets schema */
    readonly secrets?: TAppSecrets;
    /** Called after all component `onConfigReload` hooks complete */
    readonly onConfigReload?: () => Promisable<void>;
};

/**
 * Runtime options passed when creating an application instance.
 *
 * @category Application
 */
export type ApplicationOptions = {
    /** Root directory for config, secrets, and data files (default: `"."`) */
    readonly base_dir?: string;
    /** Environment name used to select config/secrets overlays */
    readonly env?: string | null;
};

/**
 * A running application that manages component lifecycles and dispatches calls.
 *
 * @typeParam TComponents - Tuple of registered components
 * @typeParam TAppConfig - Application-level config schema
 * @typeParam TAppSecrets - Application-level secrets schema
 * @category Application
 */
export type Application<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
    TAppSecrets extends ConfigSchema | undefined = undefined,
> = {
    /** Loads config and secrets, then starts components in dependency order */
    start(): Promise<void>;
    /** Stops active components in reverse dependency order */
    stop(): Promise<void>;
    /**
     * Dispatches a typed call to the owning component's handler.
     *
     * @param reference - Typed call reference
     * @param input - Call input validated against the reference's input schema
     * @returns The handler's output validated against the reference's output schema
     */
    call<TCall extends CallFrom<TComponents[number]["calls"]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
    /** Reloads all config files and invokes `onConfigReload` hooks */
    reloadConfig(): Promise<void>;
    /**
     * Reloads config for a single component.
     *
     * @param component_id - Id of the component to reload
     */
    reloadComponentConfig(
        component_id: TComponents[number]["calls"]["id"],
    ): Promise<void>;
    /** Validated application-level config, or `null` if no schema was provided */
    readonly config: TAppConfig extends ConfigSchema ? TAppConfig["infer"] : null;
    /** Validated application-level secrets, or `null` if no schema was provided */
    readonly secrets: TAppSecrets extends ConfigSchema ? TAppSecrets["infer"] : null;
    /** Application-level data directory access */
    readonly data: DataAccess;
    /** Logger factory used by this application */
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

/**
 * Returns the given application definition unchanged, preserving generic inference.
 *
 * @param definition - Application definition to pass through
 * @returns The same definition with preserved type parameters
 * @category Application
 */
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

/**
 * Creates an application instance from a definition and optional runtime options.
 *
 * @param definition - Application definition describing components and schemas
 * @param options - Runtime options for base directory and environment
 * @returns An {@link Application} ready to be started
 * @category Application
 */
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
            framework_log.info({event: "app.starting"}, "Application starting.");
            const started_at = performance.now();

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
                    await startComponent(runtime, dispatchCall, base_dir);
                }
            } catch (error) {
                lifecycle.enter("failed");
                framework_log.error({event: "app.failed", err: error}, "Application failed to start.");
                throw error;
            }

            lifecycle.enter("active");
            framework_log.info(
                {event: "app.active", ms: performance.now() - started_at},
                "Application active.",
            );
        },

        async stop(): Promise<void> {
            lifecycle.require(["active", "failed"], "stop");
            lifecycle.enter("stopping");
            framework_log.info({event: "app.stopping"}, "Application stopping.");
            const stopped_at = performance.now();

            const errors: unknown[] = [];

            for(let i = runtimes.length - 1; i >= 0; i--) {
                const runtime = runtimes[i]!;
                if(runtime.lifecycle.state !== "active") continue;

                const stop_error = await stopComponent(runtime, dispatchCall, base_dir);
                if(stop_error != null) {
                    errors.push(stop_error);
                }
            }

            lifecycle.enter("idle");
            framework_log.info(
                {event: "app.idle", ms: performance.now() - stopped_at},
                "Application idle.",
            );

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
            framework_log.info({event: "app.reloading"}, "Reloading configuration.");
            const reloaded_at = performance.now();

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
                framework_log.error({event: "app.active", err: error}, "Configuration reload failed; configuration unchanged.");
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
                const aggregate = new AggregateError(errors, "One or more onConfigReload hooks failed.");
                framework_log.error({event: "app.failed", err: aggregate}, "Configuration reload failed.");
                throw aggregate;
            }

            try {
                if(definition.onConfigReload != null) {
                    await definition.onConfigReload();
                }
            } catch (error) {
                lifecycle.enter("failed");
                framework_log.error({event: "app.failed", err: error}, "Configuration reload failed.");
                throw error;
            }

            lifecycle.enter("active");
            framework_log.info({event: "app.active", ms: performance.now() - reloaded_at}, "Configuration reloaded.");
        },

        async reloadComponentConfig(
            component_id: TComponents[number]["calls"]["id"],
        ): Promise<void> {
            lifecycle.require("active", "reloadComponentConfig");
            lifecycle.enter("reloading");
            framework_log.info({event: "app.reloading", component_id}, "Reloading component configuration.");
            const reloaded_at = performance.now();

            const runtime = id_to_runtime.get(component_id);
            if(runtime == null) {
                lifecycle.enter("active");
                const error = new UnregisteredComponentError(component_id);
                framework_log.error({event: "app.active", component_id, err: error}, "Component configuration reload failed; unknown component.");
                throw error;
            }
            if(runtime.component.config == null) {
                lifecycle.enter("active");
                framework_log.info({event: "app.active", component_id, ms: performance.now() - reloaded_at}, "Component has no configuration to reload.");
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
                framework_log.error({event: "app.active", component_id, err: error}, "Component configuration reload failed; configuration unchanged.");
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
                framework_log.error({event: "app.failed", component_id, err: error}, "Component configuration reload failed.");
                throw error;
            }

            lifecycle.enter("active");
            framework_log.info({event: "app.active", component_id, ms: performance.now() - reloaded_at}, "Component configuration reloaded.");
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

/**
 * Starts a single component: enters `starting`, runs its `start` hook (if any), then enters
 * `active`, logging each transition. Throws — after entering `failed` and logging at error — if
 * the hook rejects. Factored out so one component can be started independently, e.g. for HMR
 * (s0006).
 */
async function startComponent(
    runtime: ComponentRuntime,
    dispatchCall: DispatchFn,
    base_dir: string,
): Promise<void> {
    runtime.lifecycle.enter("starting");
    runtime.log.debug({event: "component.starting"}, "Component starting.");
    const component_started_at = performance.now();
    try {
        if(runtime.component.start != null) {
            const context = buildContext(runtime, dispatchCall, base_dir);
            await runtime.component.start(context);
        }
        runtime.lifecycle.enter("active");
        runtime.log.debug(
            {event: "component.active", ms: performance.now() - component_started_at},
            "Component active.",
        );
    } catch (error) {
        runtime.lifecycle.enter("failed");
        runtime.log.error({event: "component.failed", err: error}, "Component failed to start.");
        throw error;
    }
}

/**
 * Stops a single component: enters `stopping`, runs its `stop` hook (if any), then enters
 * `idle`, logging each transition. A throwing stop hook is logged at error and returned rather
 * than rethrown, so callers can continue best-effort. Factored out for reuse, e.g. for HMR
 * (s0006).
 *
 * @returns The error thrown by the stop hook, or `null` if it completed.
 */
async function stopComponent(
    runtime: ComponentRuntime,
    dispatchCall: DispatchFn,
    base_dir: string,
): Promise<unknown> {
    runtime.lifecycle.enter("stopping");
    runtime.log.debug({event: "component.stopping"}, "Component stopping.");
    const component_stopped_at = performance.now();
    let stop_error: unknown = null;
    if(runtime.component.stop != null) {
        try {
            const context = buildContext(runtime, dispatchCall, base_dir);
            await runtime.component.stop(context);
        } catch (error) {
            stop_error = error;
        }
    }
    runtime.lifecycle.enter("idle");
    const component_stop_ms = performance.now() - component_stopped_at;
    if(stop_error != null) {
        runtime.log.error(
            {event: "component.idle", ms: component_stop_ms, err: stop_error},
            "Component stop hook failed.",
        );
    } else {
        runtime.log.debug(
            {event: "component.idle", ms: component_stop_ms},
            "Component idle.",
        );
    }
    return stop_error;
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
