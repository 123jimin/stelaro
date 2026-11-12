/**
 * A schema that validates a value and describes its output type.
 *
 * @category Utility
 */
export interface Schema {
    /** The inferred output type of the schema. */
    readonly infer: unknown;

    /**
     * Validate and return a value.
     *
     * @param input - Value to validate
     * @returns The schema output
     */
    assert(input: unknown): this["infer"];
}
