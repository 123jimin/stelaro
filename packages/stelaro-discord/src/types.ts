import type {
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
    ComponentCallSchema,
} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {Client} from "discord.js";

/** Extracts the output type of a schema, or `null` if the schema is `undefined`. */
export type SchemaOutput<T> = T extends ComponentCallSchema ? T["infer"] : null;

/** Typed call dispatch function threaded through handler contexts. */
export type CallFn<TUses extends readonly AnyComponentCalls[]> = <
    TCall extends CallFrom<TUses[number]>,
>(reference: TCall, input: CallInput<TCall>) => Promise<CallOutput<TCall>>;

/** Shared fields present in all Discord handler contexts. */
export type BaseHandlerContext<TUses extends readonly AnyComponentCalls[]> = {
    /** The Discord.js client instance */
    readonly client: Client;
    /** Dispatches a typed call to a stelaro component */
    call: CallFn<TUses>;
};

/** A handler function that receives a typed context. */
export type HandlerFn<TContext> = (context: TContext) => Promisable<void>;
