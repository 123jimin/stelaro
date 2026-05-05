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
    const _config_dir = options?.config_dir ?? "config";
    const loggerFactory = definition.logger ?? consoleLoggerFactory;

    const ordered_components = validateAndSort(definition.components);
    const {runtimes, dispatchers} = buildRuntimes(ordered_components, loggerFactory);

    const dispatchCall: DispatchFn = async (reference, input) => {
        lifecycle.require(["active", "reloading"], "call");

        const handler = dispatchers.get(reference);
        if(handler == null) {
            throw new UnregisteredCallError(reference.component_id, reference.name);
        }

        const result = await handler(input);
        return reference.output.assert(result);
    };

    const app: Application<TComponents, TAppConfig> = {
        config: null as Application<TComponents, TAppConfig>["config"],
        async start(): Promise<void> {
            lifecycle.require("idle", "start");
            lifecycle.enter("starting");

            try {
                // TODO: load config from _config_dir (s0008)

                for(const runtime of runtimes) {
                    runtime.lifecycle.enter("starting");
                    if(runtime.component.start != null) {
                        const context = buildContext(runtime, dispatchCall);
                        await runtime.component.start(context);
                    }
                    runtime.lifecycle.enter("active");
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

            // TODO: reload all config from _config_dir (s0008)
            // TODO: call onConfigReload hooks in topological order
            // TODO: on hook failure, enter "failed" and rethrow

            lifecycle.enter("active");
        },

        async reloadComponentConfig(
            component_id: TComponents[number]["calls"]["id"],
        ): Promise<void> {
            lifecycle.require("active", "reloadComponentConfig");
            lifecycle.enter("reloading");

            // TODO: look up runtime by id, reload config (s0008)
            // TODO: call target component's onConfigReload hook
            // TODO: on hook failure, enter "failed" and rethrow

            lifecycle.enter("active");
            void component_id;
        },
    };

    return app;
}

function buildRuntimes(
    ordered_components: readonly AnyComponent[],
    loggerFactory: LoggerFactory,
): {
    runtimes: readonly ComponentRuntime[];
    dispatchers: Map<AnyComponentCallReference, (input: unknown) => Promisable<unknown>>;
} {
    const runtimes: ComponentRuntime[] = [];
    const dispatchers = new Map<AnyComponentCallReference, (input: unknown) => Promisable<unknown>>();

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

        for(const [name, reference] of Object.entries(component.calls.calls)) {
            const handler = component.handlers[name]!;
            dispatchers.set(reference, (input) => {
                // TODO: dispatch needs access to dispatchCall for context.call — currently deferred
                return handler.handle(null as unknown as AnyComponentContext, reference.input.assert(input));
            });
        }
    }

    return {runtimes, dispatchers};
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
            // TODO: replace with dedicated DuplicateComponentIdError
            throw new Error(`Duplicate component id: "${component.calls.id}".`);
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
