import type {Promisable} from "@jiminp/tooltool";

import type {
    AnyComponent,
    AnyComponentCallReference,
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
    ComponentCallName,
    ComponentContext,
} from "./component.ts";

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
    call<TCall extends CallFrom<TComponents[number]["calls"]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
};

type RuntimeHandler = {
    handle(
        context: ComponentContext<readonly AnyComponentCalls[]>,
        input: unknown,
    ): Promisable<unknown>;
};

type RuntimeComponent = {
    readonly calls: AnyComponentCalls;
    readonly uses: readonly AnyComponentCalls[];
    readonly handlers: Record<ComponentCallName, RuntimeHandler>;
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
    const dispatchers = new Map<AnyComponentCallReference, (input: unknown) => Promise<unknown>>();
    const provided_call_surfaces = new Set<AnyComponentCalls>();
    const duplicate_call_keys = new Set<ComponentCallName>();
    const registered_call_keys = new Set<ComponentCallName>();

    for(const component of definition.components) {
        provided_call_surfaces.add(component.calls);
    }

    for(const component of definition.components) {
        const runtime_component = component as RuntimeComponent;

        for(const used_calls of runtime_component.uses) {
            if(!provided_call_surfaces.has(used_calls)) {
                throw new Error(
                    [
                        `Component "${runtime_component.calls.id}" uses component calls "${used_calls.id}"`,
                        "that are not registered in the application.",
                    ].join(" "),
                );
            }
        }

        const callable_references = new Set<AnyComponentCallReference>();

        for(const used_calls of runtime_component.uses) {
            for(const reference of Object.values(used_calls.calls)) {
                callable_references.add(reference);
            }
        }

        const context: ComponentContext<readonly AnyComponentCalls[]> = {
            async call(reference, input) {
                if(!callable_references.has(reference)) {
                    throw new Error(
                        [
                            `Component "${runtime_component.calls.id}" cannot call`,
                            `"${reference.componentId}.${reference.name}" because it did not declare`,
                            "that call surface in uses.",
                        ].join(" "),
                    );
                }

                return dispatch(reference, input);
            },
        };

        for(const [name, reference] of Object.entries(runtime_component.calls.calls)) {
            const key = callKey(reference);
            if(registered_call_keys.has(key)) {
                duplicate_call_keys.add(key);
            }
            registered_call_keys.add(key);

            const handler = runtime_component.handlers[name];

            if(handler == null) {
                throw new Error(
                    `Component "${runtime_component.calls.id}" does not define a handler for "${name}".`,
                );
            }

            dispatchers.set(reference, async (input) => {
                const parsed_input = reference.input.assert(input);
                const output = await handler.handle(context, parsed_input);

                return reference.output.assert(output);
            });
        }
    }

    if(duplicate_call_keys.size > 0) {
        throw new Error(
            `Application contains duplicate component call ids: ${[...duplicate_call_keys].join(", ")}.`,
        );
    }

    async function dispatch(reference: AnyComponentCallReference, input: unknown): Promise<unknown> {
        const dispatchCall = dispatchers.get(reference);

        if(dispatchCall == null) {
            throw new Error(
                `Component call "${reference.componentId}.${reference.name}" is not registered in the application.`,
            );
        }

        return dispatchCall(input);
    }

    return {
        async call<TCall extends CallFrom<TComponents[number]["calls"]>>(
            reference: TCall,
            input: CallInput<TCall>,
        ): Promise<CallOutput<TCall>> {
            return dispatch(reference, input) as Promise<CallOutput<TCall>>;
        },
    };
}

function callKey(reference: AnyComponentCallReference): ComponentCallName {
    return `${reference.componentId}.${reference.name}`;
}
