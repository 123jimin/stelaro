import type {Promisable} from "@jiminp/tooltool";

export type ComponentId = string;

export type ComponentCallName = string;

/**
 * Minimal schema contract Peranto needs from ArkType-compatible schemas.
 *
 * `inferIn` is the input accepted at a call boundary, `infer` is the
 * validated output, and `assert` performs runtime validation.
 */
export interface ComponentCallSchema {
    readonly inferIn: unknown;
    readonly infer: unknown;
    assert(input: unknown): this["infer"];
}

type ValueOf<T extends object> = T extends unknown ? T[keyof T] : never;

/**
 * Runtime value used to call a component API without stringly typed keys.
 *
 * References carry the component id, call name, and the schemas that define
 * the call boundary.
 */
export type ComponentCallReference<
    TId extends ComponentId,
    TCallName extends ComponentCallName,
    TInputSchema extends ComponentCallSchema,
    TOutputSchema extends ComponentCallSchema,
> = {
    readonly componentId: TId;
    readonly name: TCallName;
    readonly input: TInputSchema;
    readonly output: TOutputSchema;
};

export type AnyComponentCallReference = ComponentCallReference<
    ComponentId,
    ComponentCallName,
    ComponentCallSchema,
    ComponentCallSchema
>;

export type ComponentCallDeclarations = Record<
    ComponentCallName,
    {
        readonly input: ComponentCallSchema;
        readonly output: ComponentCallSchema;
    }
>;

/**
 * Declared call surface for a component id.
 */
export type ComponentCalls<
    TId extends ComponentId,
    TDeclarations extends ComponentCallDeclarations,
> = {
    readonly id: TId;
    readonly calls: {
        readonly [TCallName in keyof TDeclarations & ComponentCallName]: ComponentCallReference<
            TId,
            TCallName,
            TDeclarations[TCallName]["input"],
            TDeclarations[TCallName]["output"]
        >;
    };
};

export type AnyComponentCalls = ComponentCalls<ComponentId, ComponentCallDeclarations>;

export type CallFrom<TCalls extends AnyComponentCalls> = ValueOf<TCalls["calls"]>;

export type CallInput<TCall extends AnyComponentCallReference> = TCall["input"]["inferIn"];

export type CallOutput<TCall extends AnyComponentCallReference> = TCall["output"]["infer"];

/**
 * Runtime capabilities available to component handlers.
 *
 * The `call` method is typed from the component's declared `uses` surfaces.
 */
export type ComponentContext<TUses extends readonly AnyComponentCalls[]> = {
    call<TCall extends CallFrom<TUses[number]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
};

/**
 * Component definition with a public call surface, declared dependencies, and
 * one handler per exposed call.
 */
export type Component<
    TCalls extends AnyComponentCalls,
    TUses extends readonly AnyComponentCalls[],
> = {
    readonly calls: TCalls;
    readonly uses: TUses;
    readonly handlers: {
        readonly [TCallName in keyof TCalls["calls"] & ComponentCallName]: {
            handle(
                context: ComponentContext<TUses>,
                input: CallInput<TCalls["calls"][TCallName]>,
            ): Promisable<CallOutput<TCalls["calls"][TCallName]>>;
        };
    };
};

export type AnyComponent = Component<AnyComponentCalls, readonly AnyComponentCalls[]>;

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
    const calls: Record<ComponentCallName, AnyComponentCallReference> = {};

    for(const [name, declaration] of Object.entries(definition.calls)) {
        calls[name] = {
            componentId: definition.id,
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
 * handlers for each exposed call.
 *
 * @param definition - Complete component definition.
 * @returns The same definition with preserved generic inference.
 */
export function defineComponent<
    const TCalls extends AnyComponentCalls,
    const TUses extends readonly AnyComponentCalls[],
>(definition: Component<TCalls, TUses>): Component<TCalls, TUses> {
    return definition;
}
