import type {Schema} from "../schema.ts";

/**
 * Schema contract for configuration and secrets validation.
 *
 * @category Configuration
 */
export interface ConfigSchema extends Schema {
    /** Pre-validation input type */
    readonly inferIn: unknown;
}
