import type {Promisable} from "@jiminp/tooltool";

import type {ConfigSchema} from "../config/types.ts";
import type {
    AnyComponentContext,
    ComponentContext,
} from "./context.ts";

/** @category Component */
export type ComponentId = string;

/** @category Component */
export type ComponentCallName = string;

/**
 * Minimal schema contract Stelaro needs from ArkType-compatible schemas.
 *
 * `inferIn` is the input accepted at a call boundary, `infer` is the
 * validated output, and `assert` performs runtime validation.
 *
 * @category Component
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
 *
 * @category Component
 */
export type ComponentCallReference<
    TId extends ComponentId,
    TCallName extends ComponentCallName,
    TInputSchema extends ComponentCallSchema,
    TOutputSchema extends ComponentCallSchema,
> = {
    readonly component_id: TId;
    readonly name: TCallName;
    readonly input: TInputSchema;
    readonly output: TOutputSchema;
};

/** @category Component */
export type AnyComponentCallReference = ComponentCallReference<
    ComponentId,
    ComponentCallName,
    ComponentCallSchema,
    ComponentCallSchema
>;

/** @category Component */
export type ComponentCallDeclarations = Record<
    ComponentCallName,
    {
        readonly input: ComponentCallSchema;
        readonly output: ComponentCallSchema;
    }
>;

/**
 * Declared call surface for a component id.
 *
 * @category Component
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

/** @category Component */
export type AnyComponentCalls = ComponentCalls<ComponentId, ComponentCallDeclarations>;

/** @category Component */
export type CallFrom<TCalls extends AnyComponentCalls> = ValueOf<TCalls["calls"]>;

/** @category Component */
export type CallInput<TCall extends AnyComponentCallReference> = TCall["input"]["inferIn"];

/** @category Component */
export type CallOutput<TCall extends AnyComponentCallReference> = TCall["output"]["infer"];

/** @category Component */
export type StateFactory<TState> = () => TState;

type ConfigOf<T> = T extends ConfigSchema ? T["infer"] : undefined;

/**
 * Component definition with a public call surface, declared dependencies, and
 * one handler per exposed call. Stateful components include a state factory.
 * Components with a config schema receive validated config through context.
 *
 * @category Component
 */
export type Component<
    TCalls extends AnyComponentCalls,
    TUses extends readonly AnyComponentCalls[],
    TState = undefined,
    TConfigSchema extends ConfigSchema | undefined = undefined,
> = {
    readonly calls: TCalls;
    readonly uses: TUses;
    readonly config?: TConfigSchema;
    readonly start?: (context: ComponentContext<TUses, TState, ConfigOf<TConfigSchema>>) => Promisable<void>;
    readonly stop?: (context: ComponentContext<TUses, TState, ConfigOf<TConfigSchema>>) => Promisable<void>;
    readonly onConfigReload?: (context: ComponentContext<TUses, TState, ConfigOf<TConfigSchema>>) => Promisable<void>;
    readonly handlers: {
        readonly [TCallName in keyof TCalls["calls"] & ComponentCallName]: {
            handle(
                context: ComponentContext<TUses, TState, ConfigOf<TConfigSchema>>,
                input: CallInput<TCalls["calls"][TCallName]>,
            ): Promisable<CallOutput<TCalls["calls"][TCallName]>>;
        };
    };
} & ([TState] extends [undefined] ? unknown : {readonly state: StateFactory<TState>});

/** @category Component */
export interface AnyComponent {
    readonly calls: AnyComponentCalls;
    readonly uses: readonly AnyComponentCalls[];
    readonly state?: StateFactory<unknown> | undefined;
    readonly config?: ConfigSchema | undefined;
    start?(context: AnyComponentContext): Promisable<void>;
    stop?(context: AnyComponentContext): Promisable<void>;
    onConfigReload?(context: AnyComponentContext): Promisable<void>;
    readonly handlers: {
        readonly [name: ComponentCallName]: {
            handle(
                context: AnyComponentContext,
                input: unknown,
            ): Promisable<unknown>;
        };
    };
}
