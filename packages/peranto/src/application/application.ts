import {join, resolve} from "node:path";

import type {Promisable} from "@jiminp/tooltool";

import {parseArgs, type ParsedArgs} from "../cli/args.ts";
import type {AnyComponentContext} from "../component/context.ts";
import {consoleLoggerFactory, type LoggerFactory} from "../component/logger.ts";
import type {
    AnyComponent,
    AnyComponentCallReference,
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
    ComponentCallName,
    ComponentId,
} from "../component/types.ts";
import {ConfigValidationError} from "../config/error.ts";
import {loadTomlConfig} from "../config/loader.ts";
import type {ConfigSchema} from "../config/types.ts";
import {TopologicalCycleError, topologicalSort} from "../util/topological-sort.ts";
import {
    CircularDependencyError,
    DuplicateCallError,
    MissingDependencyError,
    MissingHandlerError,
    UndeclaredCallError,
    UnregisteredCallError,
} from "./error.ts";
import {createLifecycleMachine} from "./lifecycle.ts";

/**
 * Reusable application declaration.
 */
export type ApplicationDefinition<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
> = {
    readonly components: TComponents;
    readonly logger?: LoggerFactory;
    readonly config?: TAppConfig;
    readonly onConfigReload?: () => Promisable<void>;
};

/**
 * Options for application runtime creation.
 */
export type ApplicationOptions = {
    readonly argv?: string[];
    readonly config_dir?: string;
};

/**
 * Runtime application capable of dispatching calls exposed by its components.
 */
export type Application<
    TComponents extends readonly AnyComponent[],
    TAppConfig extends ConfigSchema | undefined = undefined,
> = {
    readonly args: ParsedArgs;
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
} & ([TAppConfig] extends [undefined]
    ? unknown
    : {readonly config: NonNullable<TAppConfig>["infer"]});

type ComponentRuntime = {
    readonly component: AnyComponent;
    readonly log: ReturnType<LoggerFactory>;
    readonly callable_references: ReadonlySet<AnyComponentCallReference>;
    readonly call: (reference: AnyComponentCallReference, input: unknown) => Promise<unknown>;
    readonly state: unknown;
    readonly context_slot: {value: AnyComponentContext | null};
};

/**
 * Defines a reusable application declaration separately from runtime creation.
 *
 * @param definition - Components that belong to the application.
 * @returns The same definition with preserved component tuple inference.
 */
export function defineApplication<
    const TComponents extends readonly AnyComponent[],
    const TAppConfig extends ConfigSchema | undefined = undefined,
>(definition: ApplicationDefinition<TComponents, TAppConfig>): ApplicationDefinition<TComponents, TAppConfig> {
    return definition;
}

/**
 * Creates a runtime application from an application definition.
 *
 * The returned application validates call inputs and outputs with the declared
 * schemas and dispatches calls to handlers in the registered components.
 *
 * @param definition - Reusable application definition.
 * @returns Runtime application for dispatching registered component calls.
 */
export function createApplication<
    const TComponents extends readonly AnyComponent[],
    const TAppConfig extends ConfigSchema | undefined = undefined,
>(definition: ApplicationDefinition<TComponents, TAppConfig>, options?: ApplicationOptions): Application<TComponents, TAppConfig> {
    const args = parseArgs(options?.argv);
    const config_dir = options?.config_dir ?? args.config_dir ?? resolve("config");
    const {ordered_components} = validateAndSortComponents(definition.components);
    const dispatchers = new Map<AnyComponentCallReference, (input: unknown) => Promisable<unknown>>();
    const logger_factory = definition.logger ?? consoleLoggerFactory;
    const lifecycle = createLifecycleMachine();

    const ordered_runtimes: ComponentRuntime[] = [];
    const id_to_runtime = new Map<ComponentId, ComponentRuntime>();

    for(const component of ordered_components) {
        const callable_references = new Set<AnyComponentCallReference>();

        for(const used_calls of component.uses) {
            for(const reference of Object.values(used_calls.calls)) {
                callable_references.add(reference);
            }
        }

        const runtime: ComponentRuntime = {
            component,
            log: logger_factory(component.calls.id),
            callable_references,
            call(reference: AnyComponentCallReference, input: unknown) {
                if(!callable_references.has(reference)) {
                    throw new UndeclaredCallError(
                        component.calls.id,
                        reference.component_id,
                        reference.name,
                    );
                }
                return dispatch(reference, input);
            },
            state: component.state != null ? component.state() : null,
            context_slot: {value: null},
        };

        ordered_runtimes.push(runtime);
        id_to_runtime.set(component.calls.id, runtime);

        for(const [name, reference] of Object.entries(component.calls.calls)) {
            const handler = component.handlers[name]!;
            dispatchers.set(
                reference,
                (input) => handler.handle(runtime.context_slot.value!, reference.input.assert(input)),
            );
        }
    }

    let app_config: unknown = null;

    function buildContext(runtime: ComponentRuntime, config: unknown): AnyComponentContext {
        const context: Record<string, unknown> = {
            log: runtime.log,
            call: runtime.call,
        };

        if(runtime.component.state != null) {
            context["state"] = runtime.state;
        }

        if(runtime.component.config != null) {
            context["config"] = config;
        }

        return context as AnyComponentContext;
    }

    async function loadAllConfig(): Promise<void> {
        if(definition.config != null) {
            const file_path = join(config_dir, "application.toml");
            app_config = await loadTomlConfig(file_path, definition.config);
        }

        for(const runtime of ordered_runtimes) {
            if(runtime.component.config != null) {
                const config = await loadComponentConfigFile(config_dir, runtime.component, runtime.component.config);
                runtime.context_slot.value = buildContext(runtime, config);
            } else {
                runtime.context_slot.value = buildContext(runtime, null);
            }
        }
    }

    async function dispatch<TCall extends AnyComponentCallReference>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>> {
        lifecycle.require(["active", "reloading"], "call");

        const dispatchCall = dispatchers.get(reference);

        if(dispatchCall == null) {
            throw new UnregisteredCallError(reference.component_id, reference.name);
        }

        return reference.output.assert(await dispatchCall(input));
    }

    const app = {
        args,

        async start(): Promise<void> {
            lifecycle.require("idle", "start");
            lifecycle.enter("starting");

            try {
                await loadAllConfig();

                for(const runtime of ordered_runtimes) {
                    if(runtime.component.start != null) {
                        await runtime.component.start(runtime.context_slot.value!);
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

            for(let i = ordered_runtimes.length - 1; i >= 0; i--) {
                const runtime = ordered_runtimes[i]!;
                if(runtime.component.stop != null) {
                    try {
                        await runtime.component.stop(runtime.context_slot.value!);
                    } catch (error) {
                        errors.push(error);
                    }
                }
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
            return dispatch(reference, input);
        },

        async reloadConfig(): Promise<void> {
            lifecycle.require("active", "reloadConfig");
            lifecycle.enter("reloading");

            let new_app_config: unknown = null;
            const new_contexts = new Map<ComponentRuntime, AnyComponentContext>();

            try {
                if(definition.config != null) {
                    new_app_config = await loadTomlConfig(join(config_dir, "application.toml"), definition.config);
                }

                for(const runtime of ordered_runtimes) {
                    if(runtime.component.config != null) {
                        const config = await loadComponentConfigFile(config_dir, runtime.component, runtime.component.config);
                        new_contexts.set(runtime, buildContext(runtime, config));
                    }
                }
            } catch (error) {
                lifecycle.enter("active");
                throw error;
            }

            if(definition.config != null) {
                app_config = new_app_config;
            }
            for(const [runtime, context] of new_contexts) {
                runtime.context_slot.value = context;
            }

            try {
                for(const runtime of ordered_runtimes) {
                    if(runtime.component.onConfigReload != null) {
                        await runtime.component.onConfigReload(runtime.context_slot.value!);
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

            const runtime = id_to_runtime.get(component_id);
            if(runtime == null) {
                throw new ConfigValidationError(
                    join(config_dir, `${component_id}.toml`),
                    component_id,
                    new Error(`Component "${component_id}" is not registered in the application.`),
                );
            }

            if(runtime.component.config == null) {
                throw new ConfigValidationError(
                    join(config_dir, `${component_id}.toml`),
                    component_id,
                    new Error("Component does not declare a config schema."),
                );
            }

            lifecycle.enter("reloading");

            let new_context: AnyComponentContext;
            try {
                const config = await loadComponentConfigFile(config_dir, runtime.component, runtime.component.config);
                new_context = buildContext(runtime, config);
            } catch (error) {
                lifecycle.enter("active");
                throw error;
            }

            runtime.context_slot.value = new_context;

            try {
                if(runtime.component.onConfigReload != null) {
                    await runtime.component.onConfigReload(runtime.context_slot.value!);
                }
            } catch (error) {
                lifecycle.enter("failed");
                throw error;
            }

            lifecycle.enter("active");
        },
    };

    if(definition.config != null) {
        Object.defineProperty(app, "config", {
            get() { return app_config; },
            enumerable: true,
        });
    }

    return app as Application<TComponents, TAppConfig>;
}

type ComponentGraph = {
    readonly ordered_components: readonly AnyComponent[];
};

function validateAndSortComponents(components: readonly AnyComponent[]): ComponentGraph {
    const provided_call_surfaces = new Set<AnyComponentCalls>();
    const calls_to_component = new Map<AnyComponentCalls, AnyComponent>();
    const duplicate_call_keys = new Set<ComponentCallName>();
    const registered_call_keys = new Set<ComponentCallName>();

    for(const component of components) {
        provided_call_surfaces.add(component.calls);
        calls_to_component.set(component.calls, component);
    }

    for(const component of components) {
        for(const used_calls of component.uses) {
            if(!provided_call_surfaces.has(used_calls)) {
                throw new MissingDependencyError(component.calls.id, used_calls.id);
            }
        }

        for(const [, reference] of Object.entries(component.calls.calls)) {
            const key = callKey(reference);
            if(registered_call_keys.has(key)) {
                duplicate_call_keys.add(key);
            }
            registered_call_keys.add(key);

            if(component.handlers[reference.name] == null) {
                throw new MissingHandlerError(component.calls.id, reference.name);
            }
        }
    }

    if(duplicate_call_keys.size > 0) {
        throw new DuplicateCallError([...duplicate_call_keys]);
    }

    let ordered_components: readonly AnyComponent[];
    try {
        ordered_components = topologicalSort(
            [...components],
            (component) => component.uses
                .map((used_calls) => calls_to_component.get(used_calls))
                .filter((dep): dep is AnyComponent => dep != null),
        );
    } catch (error) {
        if(error instanceof TopologicalCycleError) {
            const ids = (error.remaining as AnyComponent[])
                .map((c) => c.calls.id);
            throw new CircularDependencyError(ids);
        }
        throw error;
    }

    return {ordered_components};
}

function loadComponentConfigFile(
    config_dir: string,
    component: AnyComponent,
    config_schema: ConfigSchema,
): Promise<unknown> {
    const file_path = join(config_dir, `${component.calls.id}.toml`);
    return loadTomlConfig(file_path, config_schema, component.calls.id);
}

function callKey(reference: AnyComponentCallReference): ComponentCallName {
    return `${reference.component_id}.${reference.name}`;
}
