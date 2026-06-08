import type {Promisable} from "@jiminp/tooltool";

import type {ConfigSchema} from "../config/types.ts";
import type {
    AnyComponentContext,
    ComponentContext,
} from "./context.ts";

/** A kebab-case string identifier for a component within an application.
 *
 * @category Component
 */
export type ComponentId = string;

/** A string name for a single call within a component's call surface.
 *
 * @category Component
 */
export type ComponentCallName = string;

import type {Schema} from "../schema.ts";

/**
 * Schema contract for component call boundaries.
 *
 * `inferIn` is the input accepted at a call boundary, `infer` is the
 * validated output, and `assert` performs runtime validation.
 *
 * @category Component
 */
export interface ComponentCallSchema extends Schema {
    readonly inferIn: unknown;
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
    /** Component id that owns this call */
    readonly component_id: TId;
    /** Call name within the component */
    readonly name: TCallName;
    /** Schema validating call input */
    readonly input: TInputSchema;
    /** Schema validating call output */
    readonly output: TOutputSchema;
};

/** Type-erased call reference used internally by the framework.
 *
 * @category Component
 */
export type AnyComponentCallReference = ComponentCallReference<
    ComponentId,
    ComponentCallName,
    ComponentCallSchema,
    ComponentCallSchema
>;

/** Record of call names to their input/output schema pairs.
 *
 * @category Component
 */
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

/** Type-erased component call surface.
 *
 * @category Component
 */
export type AnyComponentCalls = ComponentCalls<ComponentId, ComponentCallDeclarations>;

/** Extracts the union of call references from a component's call surface.
 *
 * @category Component
 */
export type CallFrom<TCalls extends AnyComponentCalls> = ValueOf<TCalls["calls"]>;

/** Extracts the input type accepted by a call reference.
 *
 * @category Component
 */
export type CallInput<TCall extends AnyComponentCallReference> = TCall["input"]["inferIn"];

/** Extracts the output type produced by a call reference.
 *
 * @category Component
 */
export type CallOutput<TCall extends AnyComponentCallReference> = TCall["output"]["infer"];

/** Factory function that creates fresh state for a component instance.
 *
 * @category Component
 */
export type StateFactory<TState> = () => TState;

type ConfigOf<T> = T extends ConfigSchema ? T["infer"] : undefined;
type SecretsOf<T> = T extends ConfigSchema ? T["infer"] : undefined;

/**
 * Bivariant call-handler function. Deriving the type from a method makes its
 * parameters checked bivariantly (as methods are), which keeps a concrete
 * `Component` assignable to `AnyComponent` — exactly how the object form behaves.
 */
type ComponentHandleFn<TContext, TInput, TOutput> = {
    handle(context: TContext, input: TInput): Promisable<TOutput>;
}["handle"];

/**
 * A single call handler: either a bare callable `(context, input) => …` or an
 * object exposing a `handle(context, input)` method. Both forms dispatch
 * identically; the object form leaves room for future per-handler metadata.
 *
 * @category Component
 */
export type ComponentHandler<TContext, TInput, TOutput> =
    | ComponentHandleFn<TContext, TInput, TOutput>
    | {handle: ComponentHandleFn<TContext, TInput, TOutput>};

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
    TSecretsSchema extends ConfigSchema | undefined = undefined,
> = {
    /** This component's public call surface */
    readonly calls: TCalls;
    /** Call surfaces of other components this component may invoke */
    readonly uses: TUses;
    /** Config schema for this component */
    readonly config?: TConfigSchema;
    /** Secrets schema for this component */
    readonly secrets?: TSecretsSchema;
    /** Called during application startup after config and secrets are loaded */
    readonly start?: (context: ComponentContext<TUses, TState, ConfigOf<TConfigSchema>, SecretsOf<TSecretsSchema>>) => Promisable<void>;
    /** Called during application shutdown in reverse dependency order */
    readonly stop?: (context: ComponentContext<TUses, TState, ConfigOf<TConfigSchema>, SecretsOf<TSecretsSchema>>) => Promisable<void>;
    /** Called after this component's config is reloaded */
    readonly onConfigReload?: (context: ComponentContext<TUses, TState, ConfigOf<TConfigSchema>, SecretsOf<TSecretsSchema>>) => Promisable<void>;
    /** One handler per call in the call surface (a bare callable or an object with `handle`) */
    readonly handlers: {
        readonly [TCallName in keyof TCalls["calls"] & ComponentCallName]: ComponentHandler<
            ComponentContext<TUses, TState, ConfigOf<TConfigSchema>, SecretsOf<TSecretsSchema>>,
            CallInput<TCalls["calls"][TCallName]>,
            CallOutput<TCalls["calls"][TCallName]>
        >;
    };
} & ([TState] extends [undefined] ? unknown : {readonly state: StateFactory<TState>});

/** Type-erased component definition used internally by the framework.
 *
 * @category Component
 */
export interface AnyComponent {
    readonly calls: AnyComponentCalls;
    readonly uses: readonly AnyComponentCalls[];
    readonly state?: StateFactory<unknown> | undefined;
    readonly config?: ConfigSchema | undefined;
    readonly secrets?: ConfigSchema | undefined;
    start?(context: AnyComponentContext): Promisable<void>;
    stop?(context: AnyComponentContext): Promisable<void>;
    onConfigReload?(context: AnyComponentContext): Promisable<void>;
    readonly handlers: {
        readonly [name: ComponentCallName]: ComponentHandler<AnyComponentContext, unknown, unknown>;
    };
}
