import type {AnyComponentCalls, ComponentCallFn, ComponentCallSchema} from "@jiminp/stelaro";
import type {Client} from "discord.js";

/**
 * Output type of an optional schema, or `null` when no schema is given.
 *
 * @typeParam T - Schema type, or `undefined`
 * @category Commands
 */
export type SchemaOutput<T> = T extends ComponentCallSchema ? T["infer"] : null;

/**
 * Fields shared by command, event, and interaction handler contexts.
 *
 * @typeParam TUses - Declared component call surfaces
 * @category Gateway
 */
export type BaseHandlerContext<TUses extends readonly AnyComponentCalls[]> = {
    /** The Discord.js client instance */
    readonly client: Client;
    /** Dispatches a typed call to a stelaro component */
    call: ComponentCallFn<TUses>;
};
