import type {Logger} from "./logger.ts";
import type {
    AnyComponentCallReference,
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
} from "./types.ts";

type BaseComponentContext<TUses extends readonly AnyComponentCalls[]> = {
    readonly log: Logger;
    call<TCall extends CallFrom<TUses[number]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
};

/**
 * Runtime capabilities available to component handlers.
 *
 * The `call` method is typed from the component's declared `uses` surfaces.
 * Stateful components also receive their `state` object.
 */
export type ComponentContext<
    TUses extends readonly AnyComponentCalls[],
    TState = undefined,
> = [TState] extends [undefined]
    ? BaseComponentContext<TUses>
    : BaseComponentContext<TUses> & {readonly state: TState};

export type AnyComponentContext = {
    readonly log: Logger;
    call(reference: AnyComponentCallReference, input: unknown): Promise<unknown>;
    readonly state?: unknown;
};
