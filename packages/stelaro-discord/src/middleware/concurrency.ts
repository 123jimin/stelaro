import type {Nullable} from "@jiminp/tooltool";

import type {KeyExtractor} from "./key.ts";

/**
 * Per-handler concurrency limit configuration.
 *
 * @category Middleware
 */
export type ConcurrencyOptions = {
    /** Maximum concurrent handler executions per key */
    readonly max: number;
    /** Key extraction strategy (default: {@link perUser}) */
    readonly key?: Nullable<KeyExtractor>;
};
