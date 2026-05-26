import type {DataAccess} from "../data/data.ts";
import type {Logger} from "./logger.ts";
import type {
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
} from "./types.ts";

type BaseComponentContext<TUses extends readonly AnyComponentCalls[]> = {
    readonly log: Logger;
    readonly data: DataAccess;
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
 * Components with a config schema receive their validated `config` object.
 *
 * @category Component
 */
export type ComponentContext<
    TUses extends readonly AnyComponentCalls[],
    TState = undefined,
    TConfig = undefined,
    TSecrets = undefined,
> = BaseComponentContext<TUses>
    & ([TState] extends [undefined] ? unknown : {readonly state: TState})
    & ([TConfig] extends [undefined] ? unknown : {readonly config: TConfig})
    & ([TSecrets] extends [undefined] ? unknown : {readonly secrets: TSecrets});

/** @category Component */
export type AnyComponentContext = ComponentContext<readonly AnyComponentCalls[]> & {
    readonly data: DataAccess;
    readonly state?: unknown;
    readonly config?: unknown;
    readonly secrets?: unknown;
};
