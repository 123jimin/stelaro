import type {Promisable} from "@jiminp/tooltool";
import type {type} from "arktype";

import type {DataAccess} from "../data/access.ts";
import type {AnyComponentCalls, ComponentCallFn, ComponentCallName} from "./calls.ts";
import type {Logger} from "./logger.ts";

/**
 * A function that creates state for a component instance.
 *
 * @typeParam TState - Type of the state returned by the factory
 * @returns The component's state
 *
 * @category Component
 */
export type StateFactory<TState> = () => TState;

/**
 * A function or handler object that implements a component call.
 *
 * @typeParam TContext - Context passed to the handler
 * @typeParam TInput - Input after schema validation
 * @typeParam TOutput - Output before schema validation
 * @param context - Context of the component handling the call
 * @param input - Validated input passed to the handler
 * @returns The handler result or a promise of it
 *
 * @category Component
 */
export type ComponentCallHandler<TContext, TInput, TOutput> =
    | ((context: TContext, input: TInput) => Promisable<TOutput>)
    | {handle(context: TContext, input: TInput): Promisable<TOutput>};

type ConfigSchema = type.Any<unknown>;
type IfDeclared<TDeclaration, TField> = [TDeclaration] extends [never] ? unknown : TField;

/**
 * The capabilities available to a component's handlers and lifecycle hooks.
 *
 * @typeParam TUses - Dependency call surfaces available through `call`
 * @typeParam TState - Declared state factory or `never` when omitted
 * @typeParam TConfig - Declared configuration schema or `never` when omitted
 * @typeParam TSecrets - Declared secrets schema or `never` when omitted
 *
 * @category Component
 */
export type ComponentContext<
    TUses extends readonly AnyComponentCalls[],
    TState extends StateFactory<unknown>,
    TConfig extends ConfigSchema,
    TSecrets extends ConfigSchema,
> = {
    /** The component's scoped logger. */
    readonly log: Logger;
    /** The component's scoped data directory and file access. */
    readonly data: DataAccess;
    /** Calls to references on the declared dependency surfaces. */
    readonly call: ComponentCallFn<TUses>;
}
& IfDeclared<TState, {readonly state: ReturnType<TState>}>
& IfDeclared<TConfig, {readonly config: TConfig["infer"]}>
& IfDeclared<TSecrets, {readonly secrets: TSecrets["infer"]}>;

type ComponentDeclarations<
    TCalls extends AnyComponentCalls,
    TUses extends readonly AnyComponentCalls[],
    TState extends StateFactory<unknown>,
    TConfig extends ConfigSchema,
    TSecrets extends ConfigSchema,
> = {
    /** The call surface implemented by this component. */
    readonly calls: TCalls;
    /** The dependency surfaces that this component can call. */
    readonly uses: TUses;
    /** The factory that creates state for each runtime instance. */
    readonly state?: TState;
    /** The ArkType schema for the component's configuration. */
    readonly config?: TConfig;
    /** The ArkType schema for the component's secrets. */
    readonly secrets?: TSecrets;
};

type ComponentHooks<TContext> = {
    /** The hook invoked when the component starts. */
    readonly start?: (context: TContext) => Promisable<void>;
    /** The hook invoked when the component stops. */
    readonly stop?: (context: TContext) => Promisable<void>;
    /** The hook invoked after new configuration is installed. */
    readonly onConfigReload?: (context: TContext) => Promisable<void>;
};

type ComponentHandlers<TCalls extends AnyComponentCalls, TContext> = {
    readonly [TName in keyof TCalls["calls"] & ComponentCallName]: ComponentCallHandler<
        TContext, TCalls["calls"][TName]["input"]["infer"], TCalls["calls"][TName]["output"]["inferIn"]
    >;
};

/**
 * A component definition with handlers and hooks typed from its declarations.
 *
 * @typeParam TCalls - Surface implemented by the component
 * @typeParam TUses - Dependency call surfaces
 * @typeParam TState - Declared state factory or `never` when omitted
 * @typeParam TConfig - Declared configuration schema or `never` when omitted
 * @typeParam TSecrets - Declared secrets schema or `never` when omitted
 *
 * @category Component
 */
export type Component<
    TCalls extends AnyComponentCalls,
    TUses extends readonly AnyComponentCalls[],
    TState extends StateFactory<unknown>,
    TConfig extends ConfigSchema,
    TSecrets extends ConfigSchema,
> = ComponentDeclarations<TCalls, TUses, TState, TConfig, TSecrets>
    & IfDeclared<TState, {readonly state: TState}>
    & IfDeclared<TConfig, {readonly config: TConfig}>
    & IfDeclared<TSecrets, {readonly secrets: TSecrets}>
    & ComponentHooks<ComponentContext<TUses, TState, TConfig, TSecrets>>
    & {
        /** The implementation for each call on the component's surface. */
        readonly handlers: ComponentHandlers<TCalls, ComponentContext<TUses, TState, TConfig, TSecrets>>;
    };

/**
 * A component definition with erased handler and hook parameter types.
 *
 * @category Component
 */
export type AnyComponent = ComponentDeclarations<AnyComponentCalls, readonly AnyComponentCalls[], StateFactory<unknown>, ConfigSchema, ConfigSchema>
    & ComponentHooks<never>
    & {
        /** The handlers keyed by call name. */
        readonly handlers: Readonly<Record<ComponentCallName, ComponentCallHandler<never, never, unknown>>>;
    };

/**
 * Define a component with handlers and hooks inferred from its declarations.
 *
 * @typeParam TCalls - Surface implemented by the component
 * @typeParam TUses - Dependency call surfaces
 * @typeParam TState - State factory or `never` when omitted
 * @typeParam TConfig - Configuration schema or `never` when omitted
 * @typeParam TSecrets - Secrets schema or `never` when omitted
 * @param definition - Call surface, dependencies, optional capabilities, and their implementation
 * @returns The typed component definition
 *
 * @example
 * ```typescript
 * import {defineComponent, defineComponentCalls, EmptyInput} from "@jiminp/stelaro";
 * import {type} from "arktype";
 *
 * const calls = defineComponentCalls("worker", {count: {input: EmptyInput, output: type("number")}});
 * const worker = defineComponent({
 *     calls,
 *     uses: [],
 *     state: () => ({jobs: 0}),
 *     handlers: {count: (context) => context.state.jobs},
 * });
 * ```
 *
 * @category Component
 */
export function defineComponent<
    const TCalls extends AnyComponentCalls,
    const TUses extends readonly AnyComponentCalls[],
    TState extends StateFactory<unknown> = never,
    TConfig extends ConfigSchema = never,
    TSecrets extends ConfigSchema = never,
>(definition: Component<TCalls, TUses, TState, TConfig, TSecrets>): Component<TCalls, TUses, TState, TConfig, TSecrets> {
    return definition;
}
