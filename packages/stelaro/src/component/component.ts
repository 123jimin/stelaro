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

/**
 * Defines the typed call references exposed by a component.
 *
 * @typeParam TId - Component id
 * @typeParam TDeclarations - Per-call input/output schemas
 * @param id - Component id (lowercase kebab-case)
 * @param declarations - Per-call input/output schemas
 * @returns A call surface containing typed reference values
 * @throws {InvalidComponentIdError} If `id` is not lowercase kebab-case
 * @category Component
 */
export function defineComponentCalls<
    const TId extends ComponentId,
    const TDeclarations extends ComponentCallDeclarations,
>(id: TId, declarations: TDeclarations): ComponentCalls<TId, TDeclarations> {
    if(!isValidComponentId(id)) {
        throw new InvalidComponentIdError(id);
    }

    const calls: Record<ComponentCallName, AnyComponentCallReference> = {};

    for(const [name, declaration] of Object.entries(declarations)) {
        calls[name] = {
            component_id: id,
            name,
            input: declaration.input,
            output: declaration.output,
        };
    }

    return {
        id,
        calls,
    } as ComponentCalls<TId, TDeclarations>;
}

/**
 * Defines a component from a call surface, declared used call surfaces, and
 * handlers for each exposed call.
 *
 * @typeParam TCalls - This component's call surface
 * @typeParam TUses - Call surfaces this component may invoke
 * @typeParam TState - State factory return type (default: `undefined`)
 * @typeParam TConfigSchema - Config schema (default: `undefined`)
 * @typeParam TSecretsSchema - Secrets schema (default: `undefined`)
 * @param definition - Component definition
 * @returns The component definition
 * @category Component
 */
export function defineComponent<
    const TCalls extends AnyComponentCalls,
    const TUses extends readonly AnyComponentCalls[],
    TState = undefined,
    TConfigSchema extends ConfigSchema | undefined = undefined,
    TSecretsSchema extends ConfigSchema | undefined = undefined,
>(definition: Component<TCalls, TUses, TState, TConfigSchema, TSecretsSchema>): Component<TCalls, TUses, TState, TConfigSchema, TSecretsSchema> {
    return definition;
}
