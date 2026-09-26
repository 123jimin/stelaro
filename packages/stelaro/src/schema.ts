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
