import {type as schema} from "arktype";

/**
 * Minimal ArkType-compatible schema contract for runtime validation.
 *
 * @category Utility
 */
export interface Schema {
    /** Validated output type */
    readonly infer: unknown;
    /** Validates input and returns the typed result, or throws on failure */
    assert(input: unknown): this["infer"];
}

/**
 * The input schema for a call that takes no arguments. It accepts only `{}` and rejects arrays
 * and objects with any keys.
 *
 * @category Component
 */
export const EmptyInput = schema({"+": "reject"})
    .narrow((value, ctx) => Object.getPrototypeOf(value) === Object.prototype || ctx.mustBe("a plain object"));
