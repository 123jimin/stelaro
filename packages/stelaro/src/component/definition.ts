import type {Promisable} from "@jiminp/tooltool";

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
