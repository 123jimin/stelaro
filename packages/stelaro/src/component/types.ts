import type {Promisable} from "@jiminp/tooltool";

import type {ConfigSchema} from "../config/types.ts";
import type {Schema} from "../schema.ts";
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

/**
 * Schema contract for component call boundaries.
 *
 * @category Component
 */
export interface ComponentCallSchema extends Schema {
    /** Input type accepted before validation */
    readonly inferIn: unknown;
}

type ValueOf<T extends object> = T extends unknown ? T[keyof T] : never;

/**
 * Runtime value used to call a component API without stringly typed keys.
 *
 * @typeParam TId - Owning component id
 * @typeParam TCallName - Call name within the component
 * @typeParam TInputSchema - Schema validating call input
 * @typeParam TOutputSchema - Schema validating call output
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

/** Type-erased call reference accepted by application APIs.
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
 * @typeParam TId - Owning component id
 * @typeParam TDeclarations - Per-call input/output schemas
 * @category Component
 */
export type ComponentCalls<
    TId extends ComponentId,
    TDeclarations extends ComponentCallDeclarations,
> = {
    /** Owning component id */
    readonly id: TId;
    /** Call references keyed by call name */
    readonly calls: {
        readonly [TCallName in keyof TDeclarations & ComponentCallName]: ComponentCallReference<
            TId,
            TCallName,
            TDeclarations[TCallName]["input"],
            TDeclarations[TCallName]["output"]
        >;
    };
};

/** Type-erased component call surface accepted by application APIs.
 *
 * @category Component
 */
export type AnyComponentCalls = ComponentCalls<ComponentId, ComponentCallDeclarations>;

/** Extracts the union of call references from a component's call surface.
 *
 * @typeParam TCalls - Call surface to extract references from
 * @category Component
 */
export type CallFrom<TCalls extends AnyComponentCalls> = ValueOf<TCalls["calls"]>;

/** Extracts the input type a caller passes to a call reference.
 *
 * @typeParam TCall - Call reference
 * @category Component
 */
export type CallInput<TCall extends AnyComponentCallReference> = TCall["input"]["inferIn"];

/** Extracts the validated output type a caller receives from a call reference.
 *
 * @typeParam TCall - Call reference
 * @category Component
 */
export type CallOutput<TCall extends AnyComponentCallReference> = TCall["output"]["infer"];

/**
 * Typed call dispatcher restricted to references from the given call surfaces.
 *
 * @typeParam TUses - Call surfaces whose references may be dispatched
 * @category Component
 */
export type ComponentCallFn<TUses extends readonly AnyComponentCalls[]> = <TCall extends CallFrom<TUses[number]>>(
    reference: TCall,
    input: CallInput<TCall>,
) => Promise<CallOutput<TCall>>;

/** Factory function that creates fresh state for a component instance.
 *
 * @typeParam TState - Created state type
 * @category Component
 */
export type StateFactory<TState> = () => TState;

type SchemaInfer<TSchema> = TSchema extends Schema ? TSchema["infer"] : undefined;

/** Method-derived so handler parameters are checked bivariantly, as in the object form. */
type ComponentHandleFn<TContext, TInput, TOutput> = {
    handle(context: TContext, input: TInput): Promisable<TOutput>;
}["handle"];

/**
 * A single call handler: either a bare callable `(context, input) => …` or an
 * object exposing a `handle(context, input)` method. Both forms dispatch
 * identically.
 *
 * @typeParam TContext - Component context passed to the handler
 * @typeParam TInput - Validated call input
 * @typeParam TOutput - Output accepted by the call's output schema
 * @category Component
 */
export type ComponentHandler<TContext, TInput, TOutput> =
    | ComponentHandleFn<TContext, TInput, TOutput>
    | {handle: ComponentHandleFn<TContext, TInput, TOutput>};

type ComponentBody<
    TCalls extends AnyComponentCalls,
    TUses extends readonly AnyComponentCalls[],
    TConfigSchema extends ConfigSchema | undefined,
    TSecretsSchema extends ConfigSchema | undefined,
    TContext,
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
    readonly start?: (context: TContext) => Promisable<void>;
    /** Called during application shutdown in reverse dependency order */
    readonly stop?: (context: TContext) => Promisable<void>;
    /** Called after this component's config is reloaded */
    readonly onConfigReload?: (context: TContext) => Promisable<void>;
    /** One handler per call in the call surface (a bare callable or an object with `handle`) */
    readonly handlers: {
        readonly [TCallName in keyof TCalls["calls"] & ComponentCallName]: ComponentHandler<
            TContext,
            TCalls["calls"][TCallName]["input"]["infer"],
            TCalls["calls"][TCallName]["output"]["inferIn"]
        >;
    };
};

/**
 * Component definition with a public call surface, declared dependencies, and
 * one handler per exposed call. Handlers receive validated input and return
 * values accepted by the output schema.
 *
 * @typeParam TCalls - This component's call surface
 * @typeParam TUses - Call surfaces this component may invoke
 * @typeParam TState - State factory return type (default: `undefined`)
 * @typeParam TConfigSchema - Config schema (default: `undefined`)
 * @typeParam TSecretsSchema - Secrets schema (default: `undefined`)
 * @category Component
 */
export type Component<
    TCalls extends AnyComponentCalls,
    TUses extends readonly AnyComponentCalls[],
    TState = undefined,
    TConfigSchema extends ConfigSchema | undefined = undefined,
    TSecretsSchema extends ConfigSchema | undefined = undefined,
> = ComponentBody<
    TCalls,
    TUses,
    TConfigSchema,
    TSecretsSchema,
    ComponentContext<TUses, NoInfer<TState>, SchemaInfer<TConfigSchema>, SchemaInfer<TSecretsSchema>>
> & ([TState] extends [undefined] ? unknown : {
    /** Creates this component's state once per application runtime */
    readonly state: StateFactory<TState>;
});

/** Type-erased component definition accepted by application APIs.
 *
 * @category Component
 */
export interface AnyComponent {
    /** This component's public call surface */
    readonly calls: AnyComponentCalls;
    /** Call surfaces of other components this component may invoke */
    readonly uses: readonly AnyComponentCalls[];
    /** State factory, if the component is stateful */
    readonly state?: StateFactory<unknown> | undefined;
    /** Config schema, if declared */
    readonly config?: ConfigSchema | undefined;
    /** Secrets schema, if declared */
    readonly secrets?: ConfigSchema | undefined;
    /** Called during application startup */
    start?(context: AnyComponentContext): Promisable<void>;
    /** Called during application shutdown */
    stop?(context: AnyComponentContext): Promisable<void>;
    /** Called after this component's config is reloaded */
    onConfigReload?(context: AnyComponentContext): Promisable<void>;
    /** Handlers keyed by call name */
    readonly handlers: {
        readonly [name: ComponentCallName]: ComponentHandler<AnyComponentContext, unknown, unknown>;
    };
}
