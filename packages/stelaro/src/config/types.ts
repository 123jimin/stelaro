import type {Schema} from "../schema.ts";

/** @category Configuration */
export interface ConfigSchema extends Schema {
    readonly inferIn: unknown;
}
