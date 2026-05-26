/**
 * Minimal schema contract for runtime validation.
 *
 * Compatible with ArkType schemas. `infer` is the validated output type,
 * and `assert` performs runtime validation.
 */
export interface Schema {
    readonly infer: unknown;
    assert(input: unknown): this["infer"];
}
