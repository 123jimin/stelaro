import {DuplicateCallError, InvalidComponentIdError, MismatchedComponentIdError} from "./error.ts";
import type {ComponentCallSchema} from "./schema.ts";

/**
 * A component's stable lowercase kebab-case ID.
 *
 * @category Component
 */
export type ComponentId = string;

/**
 * A call name within a component.
 *
 * @category Component
 */
export type ComponentCallName = string;

/**
 * A reference to a declared call and its input and output schemas.
 *
 * @typeParam TId - Component ID
 * @typeParam TName - Call name
 * @typeParam TInput - Input schema
 * @typeParam TOutput - Output schema
 *
 * @category Component
 */
export type ComponentCallReference<
    TId extends ComponentId,
    TName extends ComponentCallName,
    TInput extends ComponentCallSchema,
    TOutput extends ComponentCallSchema,
> = {
    /** The ID of the component that declares the call. */
    readonly component_id: TId;
    /** The name of the call within the component. */
    readonly name: TName;
    /** The schema for values supplied by the caller. */
    readonly input: TInput;
    /** The schema for values returned by the handler. */
    readonly output: TOutput;
};

/**
 * A call reference whose identity and schema types are unrestricted.
 *
 * @category Component
 */
export type AnyComponentCallReference = ComponentCallReference<
    ComponentId, ComponentCallName, ComponentCallSchema, ComponentCallSchema
>;

/**
 * The input and output schemas declared under each call name.
 *
 * @category Component
 */
export type ComponentCallDeclarations = Readonly<Record<ComponentCallName, {
    readonly input: ComponentCallSchema;
    readonly output: ComponentCallSchema;
}>>;

type CallReferences = Readonly<Record<ComponentCallName, AnyComponentCallReference>>;

/**
 * The declared call surface of one component.
 *
 * @typeParam TId - Component ID
 * @typeParam TReferences - Map of call names to references
 *
 * @category Component
 */
export type ComponentCalls<TId extends ComponentId, TReferences extends CallReferences> = {
    /** The ID shared by all calls in the surface. */
    readonly id: TId;
    /** The call references keyed by their names. */
    readonly calls: TReferences;
};

/**
 * A component call surface whose ID and call map are unrestricted.
 *
 * @category Component
 */
export type AnyComponentCalls = ComponentCalls<ComponentId, CallReferences>;

type DeclaredCallReferences<TId extends ComponentId, TDeclarations extends ComponentCallDeclarations> = {
    readonly [TName in keyof TDeclarations & (string | number) as `${TName}`]: ComponentCallReference<
        TId, `${TName}`, TDeclarations[TName]["input"], TDeclarations[TName]["output"]
    >;
};

/**
 * The combined call maps of the statically known surfaces in a tuple.
 *
 * @typeParam TSurfaces - Tuple of component call surfaces
 *
 * @category Component
 */
export type MergedCallReferences<TSurfaces extends readonly AnyComponentCalls[]> =
    TSurfaces extends readonly [infer TFirst extends AnyComponentCalls, ...infer TRest extends readonly AnyComponentCalls[]]
        ? TFirst["calls"] & MergedCallReferences<TRest>
        : unknown;

/**
 * The result type of merging call surfaces for the same component.
 *
 * @typeParam TSurfaces - Nonempty tuple of component call surfaces
 *
 * @category Component
 */
export type MergedComponentCalls<TSurfaces extends readonly [AnyComponentCalls, ...AnyComponentCalls[]]> =
    ComponentCalls<TSurfaces[0]["id"], MergedCallReferences<TSurfaces>>;

type CallValues<TReferences> = TReferences extends unknown ? TReferences[keyof TReferences] : never;

/**
 * The union of call references declared on a component surface.
 *
 * @typeParam TCalls - Component call surface
 *
 * @category Component
 */
export type CallFrom<TCalls extends AnyComponentCalls> = CallValues<TCalls["calls"]>;

/**
 * The input a caller supplies before schema validation.
 *
 * @typeParam TCall - Call reference
 *
 * @category Component
 */
export type CallInput<TCall extends AnyComponentCallReference> = TCall["input"]["inferIn"];

/**
 * The output a caller receives after schema validation.
 *
 * @typeParam TCall - Call reference
 *
 * @category Component
 */
export type CallOutput<TCall extends AnyComponentCallReference> = TCall["output"]["infer"];

/**
 * A call function restricted to the references declared by its dependency surfaces.
 *
 * @typeParam TUses - Dependency call surfaces
 * @param reference - Reference to a declared dependency call
 * @param input - Input accepted by the referenced call
 * @returns The validated result of the referenced call
 *
 * @category Component
 */
export type ComponentCallFn<TUses extends readonly AnyComponentCalls[]> =
    <TCall extends CallFrom<TUses[number]>>(reference: TCall, input: NoInfer<CallInput<TCall>>) => Promise<CallOutput<TCall>>;

/**
 * Define a component's typed call references from its schemas.
 *
 * @typeParam TId - Component ID
 * @typeParam TDeclarations - Map of call names to input and output schemas
 * @param id - Component ID in lowercase kebab-case
 * @param declarations - Input and output schemas for each named call
 * @returns The component's call surface
 * @throws {InvalidComponentIdError} The ID is outside lowercase kebab-case.
 *
 * @example
 * ```typescript
 * import {defineComponentCalls, EmptyInput} from "@jiminp/stelaro";
 * import {type} from "arktype";
 *
 * const calls = defineComponentCalls("health-check", {
 *     readStatus: {input: EmptyInput, output: type({ready: "boolean"})},
 * });
 * ```
 *
 * @category Component
 */
export function defineComponentCalls<const TId extends ComponentId, const TDeclarations extends ComponentCallDeclarations>(
    id: TId,
    declarations: TDeclarations,
): ComponentCalls<TId, DeclaredCallReferences<TId, TDeclarations>> {
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
        throw new InvalidComponentIdError(id);
    }

    const entries = Object.entries(declarations).map(
        ([name, {input, output}]): [ComponentCallName, AnyComponentCallReference] => [name, {component_id: id, name, input, output}],
    );
    const calls = Object.fromEntries(entries);
    // Object.fromEntries cannot preserve the link between each key and its schema types.
    return {id, calls: calls as DeclaredCallReferences<TId, TDeclarations>};
}

/**
 * Merge call surfaces for the same component while preserving their references.
 *
 * @typeParam TFirst - Type of the first surface
 * @typeParam TRest - Types of the remaining surfaces
 * @param first - First call surface
 * @param rest - Additional call surfaces for the same component
 * @returns A surface containing every input reference
 * @throws {MismatchedComponentIdError} A surface belongs to a different component.
 * @throws {DuplicateCallError} A call name appears on multiple surfaces.
 *
 * @example
 * ```typescript
 * import {defineComponentCalls, EmptyInput, mergeComponentCalls} from "@jiminp/stelaro";
 * import {type} from "arktype";
 *
 * const public_calls = defineComponentCalls("worker", {ready: {input: EmptyInput, output: type("boolean")}});
 * const internal_calls = defineComponentCalls("worker", {jobs: {input: EmptyInput, output: type("number")}});
 * const all_calls = mergeComponentCalls(public_calls, internal_calls);
 * ```
 *
 * @category Component
 */
export function mergeComponentCalls<TFirst extends AnyComponentCalls, const TRest extends readonly AnyComponentCalls[]>(
    first: TFirst,
    ...rest: TRest
): MergedComponentCalls<readonly [TFirst, ...TRest]> {
    const calls = new Map<ComponentCallName, AnyComponentCallReference>();
    for(const surface of [first, ...rest]) {
        if(surface.id !== first.id) {
            throw new MismatchedComponentIdError(first.id, surface.id);
        }
        for(const [name, reference] of Object.entries(surface.calls)) {
            if(calls.has(name)) {
                throw new DuplicateCallError(first.id, name);
            }
            calls.set(name, reference);
        }
    }
    return {id: first.id, calls: Object.fromEntries(calls) as MergedCallReferences<readonly [TFirst, ...TRest]>};
}
