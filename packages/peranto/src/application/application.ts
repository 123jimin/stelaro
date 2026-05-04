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

type RuntimeHandler = {
    handle(
        context: AnyComponentContext,
        input: unknown,
    ): Promisable<unknown>;
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
    const dispatchers = new Map<AnyComponentCallReference, (input: unknown) => Promisable<unknown>>();
    const provided_call_surfaces = new Set<AnyComponentCalls>();
    const calls_to_component = new Map<AnyComponentCalls, AnyComponent>();
    const id_to_component = new Map<ComponentId, AnyComponent>();
    const duplicate_call_keys = new Set<ComponentCallName>();
    const registered_call_keys = new Set<ComponentCallName>();
    const contexts = new Map<AnyComponent, AnyComponentContext>();
    const config_slots = new Map<AnyComponent, {value: unknown}>();
    const logger_factory = definition.logger ?? consoleLoggerFactory;

    const app_config_slot: {value: unknown} = {value: void 0};

    for(const component of definition.components) {
        provided_call_surfaces.add(component.calls);
        calls_to_component.set(component.calls, component);
        id_to_component.set(component.calls.id, component);
    }

    for(const component of definition.components) {
        for(const used_calls of component.uses) {
            if(!provided_call_surfaces.has(used_calls)) {
                throw new MissingDependencyError(component.calls.id, used_calls.id);
            }
        }

        const callable_references = new Set<AnyComponentCallReference>();

        for(const used_calls of component.uses) {
            for(const reference of Object.values(used_calls.calls)) {
                callable_references.add(reference);
            }
        }

        const slot = {value: void 0 as unknown};
        config_slots.set(component, slot);

        const base_context: AnyComponentContext = {
            log: logger_factory(component.calls.id),
            call(reference, input) {
                if(!callable_references.has(reference)) {
                    throw new UndeclaredCallError(
                        component.calls.id,
                        reference.component_id,
                        reference.name,
                    );
                }

                return dispatch(reference, input);
            },
        };

        const context_obj: Record<string, unknown> = {};

        for(const [key, value] of Object.entries(base_context)) {
            context_obj[key] = value;
        }

        if(component.state != null) {
            context_obj["state"] = component.state();
        }

        if(component.config != null) {
            Object.defineProperty(context_obj, "config", {
                get() { return slot.value; },
                enumerable: true,
            });
        }

        const context = context_obj as AnyComponentContext;
        contexts.set(component, context);

        for(const [name, reference] of Object.entries(component.calls.calls)) {
            const key = callKey(reference);
            if(registered_call_keys.has(key)) {
                duplicate_call_keys.add(key);
            }
            registered_call_keys.add(key);

            const handler: RuntimeHandler | undefined = component.handlers[name];

            if(handler == null) {
                throw new MissingHandlerError(component.calls.id, name);
            }

            dispatchers.set(
                reference,
                (input) => handler.handle(context, reference.input.assert(input)),
            );
        }
    }

    if(duplicate_call_keys.size > 0) {
        throw new DuplicateCallError([...duplicate_call_keys]);
    }

    let ordered_components: readonly AnyComponent[];
    try {
        ordered_components = topologicalSort(
            [...definition.components],
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

    const lifecycle = createLifecycleMachine();

    async function loadAllConfig(): Promise<void> {
        if(definition.config != null) {
            const file_path = join(config_dir, "application.toml");
            app_config_slot.value = await loadTomlConfig(file_path, definition.config);
        }

        for(const component of ordered_components) {
            if(component.config != null) {
                const file_path = join(config_dir, `${component.calls.id}.toml`);
                const slot = config_slots.get(component)!;
                slot.value = await loadTomlConfig(file_path, component.config, component.calls.id);
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

                for(const component of ordered_components) {
                    if(component.start != null) {
                        await component.start(contexts.get(component)!);
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

            for(let i = ordered_components.length - 1; i >= 0; i--) {
                const component = ordered_components[i]!;
                if(component.stop != null) {
                    try {
                        await component.stop(contexts.get(component)!);
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

            let new_app_config: unknown;
            const new_component_configs = new Map<AnyComponent, unknown>();

            try {
                new_app_config = definition.config != null
                    ? await loadTomlConfig(join(config_dir, "application.toml"), definition.config)
                    : void 0;

                for(const component of ordered_components) {
                    if(component.config != null) {
                        const file_path = join(config_dir, `${component.calls.id}.toml`);
                        new_component_configs.set(
                            component,
                            await loadTomlConfig(file_path, component.config, component.calls.id),
                        );
                    }
                }
            } catch (error) {
                lifecycle.enter("active");
                throw error;
            }

            if(new_app_config !== void 0) {
                app_config_slot.value = new_app_config;
            }
            for(const [component, value] of new_component_configs) {
                config_slots.get(component)!.value = value;
            }

            try {
                for(const component of ordered_components) {
                    if(component.onConfigReload != null) {
                        await component.onConfigReload(contexts.get(component)!);
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

            const component = id_to_component.get(component_id);
            if(component == null) {
                throw new ConfigValidationError(
                    join(config_dir, `${component_id}.toml`),
                    component_id,
                    new Error(`Component "${component_id}" is not registered in the application.`),
                );
            }

            if(component.config == null) {
                throw new ConfigValidationError(
                    join(config_dir, `${component_id}.toml`),
                    component_id,
                    new Error("Component does not declare a config schema."),
                );
            }

            lifecycle.enter("reloading");

            let new_config: unknown;
            try {
                new_config = await loadTomlConfig(
                    join(config_dir, `${component_id}.toml`),
                    component.config,
                    component_id,
                );
            } catch (error) {
                lifecycle.enter("active");
                throw error;
            }

            config_slots.get(component)!.value = new_config;

            try {
                if(component.onConfigReload != null) {
                    await component.onConfigReload(contexts.get(component)!);
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
            get() { return app_config_slot.value; },
            enumerable: true,
        });
    }

    return app as Application<TComponents, TAppConfig>;
}

function callKey(reference: AnyComponentCallReference): ComponentCallName {
    return `${reference.component_id}.${reference.name}`;
}
