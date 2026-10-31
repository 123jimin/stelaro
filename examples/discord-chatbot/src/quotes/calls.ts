import {defineComponentCalls} from "@jiminp/stelaro";
import {type} from "arktype";

export const QuoteSchema = type({
    quote_id: "string",
    content: "string",
    author_discord_user_id: "string",
    author_display_name: "string",
    saved_by_user_id: "string",
    saved_by_discord_user_id: "string",
    source_message_id: "string | null",
    created_at: "string",
});

export type QuoteRecord = typeof QuoteSchema.infer;

export const QuotesCalls = defineComponentCalls("quotes", {
    "create": {
        input: type({
            content: "string",
            author_discord_user_id: "string",
            author_display_name: "string",
            saved_by_user_id: "string",
            saved_by_discord_user_id: "string",
            source_message_id: "string | null",
        }),
        // Returns the existing quote with `created: false` when `source_message_id` was already saved
        output: type({quote: QuoteSchema, created: "boolean"}),
    },
    "delete": {
        input: type({quote_id: "string", deleted_by_discord_user_id: "string"}),
        output: type({deleted: "boolean"}),
    },
    "random": {
        input: type({"author_discord_user_id?": "string"}),
        output: QuoteSchema.or("null"),
    },
    "search": {
        input: type({query: "string"}),
        output: type({quotes: QuoteSchema.array()}),
    },
    "getReactionConfig": {
        input: type({}),
        output: type({
            board_channel_id: "string",
            reaction_emoji: "string",
            reaction_threshold: "number",
        }),
    },
    "list": {
        input: type({"author_discord_user_id?": "string", "page": "number"}),
        output: type({quotes: QuoteSchema.array(), total_pages: "number"}),
    },
});
