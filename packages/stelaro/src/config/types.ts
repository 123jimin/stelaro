import type {Schema} from "../schema.ts";

/**
 * Schema contract for configuration and secrets validation.
 *
 * Extends {@link Schema} with `inferIn` to represent the pre-validation input type.
 *
 * @category Configuration
 */
export interface ConfigSchema extends Schema {
    /** Pre-validation input type */
    readonly inferIn: unknown;
}
