/**
 * Minimal schema contract for runtime validation.
 *
 * Compatible with ArkType schemas. `infer` is the validated output type,
 * and `assert` performs runtime validation.
 *
 * @category Utility
 */
export interface Schema {
    /** Validated output type */
    readonly infer: unknown;
    /** Validates input and returns the typed result, or throws on failure */
    assert(input: unknown): this["infer"];
}
