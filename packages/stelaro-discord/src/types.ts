import type {
    AnyComponentCalls,
    CallFrom,
    CallInput,
    CallOutput,
    ComponentCallSchema,
} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {Client} from "discord.js";

export type SchemaOutput<T> = T extends ComponentCallSchema ? T["infer"] : null;

export type CallFn<TUses extends readonly AnyComponentCalls[]> = <
    TCall extends CallFrom<TUses[number]>,
>(reference: TCall, input: CallInput<TCall>) => Promise<CallOutput<TCall>>;

export type BaseHandlerContext<TUses extends readonly AnyComponentCalls[]> = {
    readonly client: Client;
    call: CallFn<TUses>;
};

export type HandlerFn<TContext> = (context: TContext) => Promisable<void>;
