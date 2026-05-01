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
    const duplicate_call_keys = new Set<ComponentCallName>();
    const registered_call_keys = new Set<ComponentCallName>();

    for(const component of definition.components) {
        provided_call_surfaces.add(component.calls);
    }

    for(const component of definition.components) {
        for(const used_calls of component.uses) {
            if(!provided_call_surfaces.has(used_calls)) {
                throw new Error(
                    [
                        `Component "${component.calls.id}" uses component calls "${used_calls.id}"`,
                        "that are not registered in the application.",
                    ].join(" "),
                );
            }
        }

        const callable_references = new Set<AnyComponentCallReference>();

        for(const used_calls of component.uses) {
            for(const reference of Object.values(used_calls.calls)) {
                callable_references.add(reference);
            }
        }

        const context: ComponentContext<readonly AnyComponentCalls[]> = {
            call(reference, input) {
                if(!callable_references.has(reference)) {
                    throw new Error(
                        [
                            `Component "${component.calls.id}" cannot call`,
                            `"${reference.componentId}.${reference.name}" because it did not declare`,
                            "that call surface in uses.",
                        ].join(" "),
                    );
                }

                return dispatch(reference, input);
            },
        };

        for(const [name, reference] of Object.entries(component.calls.calls)) {
            const key = callKey(reference);
            if(registered_call_keys.has(key)) {
                duplicate_call_keys.add(key);
            }
            registered_call_keys.add(key);

            const handler: RuntimeHandler | undefined = component.handlers[name];

            if(handler == null) {
                throw new Error(
                    `Component "${component.calls.id}" does not define a handler for "${name}".`,
                );
            }

            dispatchers.set(
                reference,
                (input) => handler.handle(context, reference.input.assert(input)),
            );
        }
    }

    if(duplicate_call_keys.size > 0) {
        throw new Error(
            `Application contains duplicate component call ids: ${[...duplicate_call_keys].join(", ")}.`,
        );
    }

    async function dispatch<TCall extends AnyComponentCallReference>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>> {
        const dispatchCall = dispatchers.get(reference);

        if(dispatchCall == null) {
            throw new Error(
                `Component call "${reference.componentId}.${reference.name}" is not registered in the application.`,
            );
        }

        return reference.output.assert(await dispatchCall(input));
    }

    return {
        call<TCall extends CallFrom<TComponents[number]["calls"]>>(
            reference: TCall,
            input: CallInput<TCall>,
        ): Promise<CallOutput<TCall>> {
            return dispatch(reference, input);
        },
    };
}

function callKey(reference: AnyComponentCallReference): ComponentCallName {
    return `${reference.componentId}.${reference.name}`;
}
