import type {Promisable} from "@jiminp/tooltool";

import type {
    AnyComponent,
    AnyComponentCallReference,
    AnyComponentCalls,
    AnyComponentContext,
    CallFrom,
    CallInput,
    CallOutput,
    ComponentCallName,
} from "./component.ts";
import {
    CircularDependencyError,
    DuplicateCallError,
    MissingDependencyError,
    MissingHandlerError,
    UndeclaredCallError,
    UnregisteredCallError,
} from "./error.ts";
import type {LifecycleState} from "./lifecycle.ts";
import {LifecycleStateError} from "./lifecycle.ts";
import {TopologicalCycleError, topologicalSort} from "./util/topological-sort.ts";

/**
 * Reusable application declaration.
 */
export type ApplicationDefinition<TComponents extends readonly AnyComponent[]> = {
    readonly components: TComponents;
};

/**
 * Runtime application capable of dispatching calls exposed by its components.
 */
export type Application<TComponents extends readonly AnyComponent[]> = {
    start(): Promise<void>;
    stop(): Promise<void>;
    call<TCall extends CallFrom<TComponents[number]["calls"]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
};

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
>(definition: ApplicationDefinition<TComponents>): ApplicationDefinition<TComponents> {
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
>(definition: ApplicationDefinition<TComponents>): Application<TComponents> {
    const dispatchers = new Map<AnyComponentCallReference, (input: unknown) => Promisable<unknown>>();
    const provided_call_surfaces = new Set<AnyComponentCalls>();
    const calls_to_component = new Map<AnyComponentCalls, AnyComponent>();
    const duplicate_call_keys = new Set<ComponentCallName>();
    const registered_call_keys = new Set<ComponentCallName>();
    const contexts = new Map<AnyComponent, AnyComponentContext>();

    for(const component of definition.components) {
        provided_call_surfaces.add(component.calls);
        calls_to_component.set(component.calls, component);
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

        const call_context: AnyComponentContext = {
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

        const context: AnyComponentContext = component.state != null
            ? {...call_context, state: component.state()}
            : call_context;

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

    let lifecycle_state: LifecycleState = "idle";

    async function dispatch<TCall extends AnyComponentCallReference>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>> {
        if(lifecycle_state !== "active") {
            throw new LifecycleStateError(lifecycle_state, "call");
        }

        const dispatchCall = dispatchers.get(reference);

        if(dispatchCall == null) {
            throw new UnregisteredCallError(reference.component_id, reference.name);
        }

        return reference.output.assert(await dispatchCall(input));
    }

    return {
        async start(): Promise<void> {
            if(lifecycle_state !== "idle") {
                throw new LifecycleStateError(lifecycle_state, "start");
            }

            lifecycle_state = "starting";

            try {
                for(const component of ordered_components) {
                    if(component.start != null) {
                        await component.start(contexts.get(component)!);
                    }
                }
            } catch (error) {
                lifecycle_state = "failed";
                throw error;
            }

            lifecycle_state = "active";
        },

        async stop(): Promise<void> {
            if(lifecycle_state !== "active" && lifecycle_state !== "failed") {
                throw new LifecycleStateError(lifecycle_state, "stop");
            }

            lifecycle_state = "stopping";

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

            lifecycle_state = "idle";

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
    };
}

function callKey(reference: AnyComponentCallReference): ComponentCallName {
    return `${reference.component_id}.${reference.name}`;
}
