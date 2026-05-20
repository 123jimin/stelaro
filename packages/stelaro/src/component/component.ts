import type {ConfigSchema} from "../config/types.ts";
import {InvalidComponentIdError, isValidComponentId} from "../error.ts";
import type {
    AnyComponentCallReference,
    AnyComponentCalls,
    Component,
    ComponentCallDeclarations,
    ComponentCallName,
    ComponentCalls,
    ComponentId,
} from "./types.ts";

export type * from "./context.ts";
export type * from "./types.ts";

/**
 * Defines the typed call references exposed by a component.
 *
 * @param definition - Component id plus per-call input/output schemas.
 * @returns A call surface containing typed reference values.
 */
export function defineComponentCalls<
    const TId extends ComponentId,
    const TDeclarations extends ComponentCallDeclarations,
>(definition: {
    readonly id: TId;
    readonly calls: TDeclarations;
}): ComponentCalls<TId, TDeclarations> {
    if(!isValidComponentId(definition.id)) {
        throw new InvalidComponentIdError(definition.id);
    }

    const calls: Record<ComponentCallName, AnyComponentCallReference> = {};

    for(const [name, declaration] of Object.entries(definition.calls)) {
        calls[name] = {
            component_id: definition.id,
            name,
            input: declaration.input,
            output: declaration.output,
        };
    }

    return {
        id: definition.id,
        calls,
    } as ComponentCalls<TId, TDeclarations>;
}

/**
 * Defines a component from a call surface, declared used call surfaces, and
 * handlers for each exposed call. Optionally includes a state factory.
 *
 * @param definition - Complete component definition.
 * @returns The same definition with preserved generic inference.
 */
export function defineComponent<
    const TCalls extends AnyComponentCalls,
    const TUses extends readonly AnyComponentCalls[],
    TState = undefined,
    TConfigSchema extends ConfigSchema | undefined = undefined,
>(definition: Component<TCalls, TUses, TState, TConfigSchema>): Component<TCalls, TUses, TState, TConfigSchema> {
    return definition;
}
