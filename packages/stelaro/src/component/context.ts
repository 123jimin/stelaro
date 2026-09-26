import type {DataAccess} from "../data/data.ts";
import type {Logger} from "./logger.ts";
import type {AnyComponentCalls, ComponentCallFn} from "./types.ts";

/**
 * Runtime capabilities available to component handlers and hooks.
 *
 * `call` accepts only references from the declared `uses` surfaces, and
 * `state`, `config`, and `secrets` are present only when the component declares them.
 *
 * @typeParam TUses - Call surfaces the component may invoke
 * @typeParam TState - Component state type (default: `undefined`)
 * @typeParam TConfig - Validated config type (default: `undefined`)
 * @typeParam TSecrets - Validated secrets type (default: `undefined`)
 * @category Component
 */
export type ComponentContext<
    TUses extends readonly AnyComponentCalls[],
    TState = undefined,
    TConfig = undefined,
    TSecrets = undefined,
> = {
    /** Logger scoped to this component */
    readonly log: Logger;
    /** Component-scoped data directory access */
    readonly data: DataAccess;
    /** Dispatches a typed call to a component from a declared `uses` surface */
    readonly call: ComponentCallFn<TUses>;
} & ([TState] extends [undefined] ? unknown : {
    /** State created by the component's state factory */
    readonly state: TState;
}) & ([TConfig] extends [undefined] ? unknown : {
    /** Validated component config */
    readonly config: TConfig;
}) & ([TSecrets] extends [undefined] ? unknown : {
    /** Validated component secrets */
    readonly secrets: TSecrets;
});

/** Type-erased component context accepted by application APIs.
 *
 * @category Component
 */
export type AnyComponentContext = ComponentContext<readonly AnyComponentCalls[]> & {
    /** Component state, if the component is stateful */
    readonly state?: unknown;
    /** Validated component config, if declared */
    readonly config?: unknown;
    /** Validated component secrets, if declared */
    readonly secrets?: unknown;
};
