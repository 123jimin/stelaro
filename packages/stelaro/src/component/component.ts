import {DuplicateCallError} from "../application/error.ts";
import type {ConfigSchema} from "../config/types.ts";
import {InvalidComponentIdError, isValidComponentId, MismatchedComponentIdError} from "../error.ts";
import type {
    AnyComponentCallReference,
    AnyComponentCalls,
    Component,
    ComponentCallDeclarations,
    ComponentCallName,
    ComponentCalls,
    ComponentId,
    MergedComponentCalls,
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
 * Combines call surfaces of the same component into one, for example a public part that a
 * gateway exposes and an internal part that only other components call. The result reuses the
 * given surfaces' call references, so a reference from any part dispatches to the component
 * defined with the merged surface.
 *
 * @typeParam TFirst - First call surface
 * @typeParam TRest - Further call surfaces
 * @param first - Call surface to merge
 * @param rest - Further call surfaces to merge
 * @returns A call surface with the component's id and every call of the given surfaces
 * @throws {MismatchedComponentIdError} If the surfaces belong to different components
 * @throws {DuplicateCallError} If two surfaces declare a call of the same name
 * @category Component
 */
export function mergeComponentCalls<
    const TFirst extends AnyComponentCalls,
    const TRest extends readonly (AnyComponentCalls & {readonly id: TFirst["id"]})[],
>(first: TFirst, ...rest: TRest): MergedComponentCalls<readonly [TFirst, ...TRest]> {
    const calls: Record<ComponentCallName, AnyComponentCallReference> = {...first.calls};
    const duplicate_keys: string[] = [];
    for(const surface of rest) {
        if(surface.id !== first.id) {
            throw new MismatchedComponentIdError(first.id, surface.id);
        }
        for(const [name, reference] of Object.entries(surface.calls)) {
            if(name in calls) {
                duplicate_keys.push(`${first.id}.${name}`);
            }
            calls[name] = reference;
        }
    }
    if(duplicate_keys.length > 0) {
        throw new DuplicateCallError(duplicate_keys);
    }

    return {id: first.id, calls} as MergedComponentCalls<readonly [TFirst, ...TRest]>;
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
