import {defineComponentCalls} from "@jiminp/peranto";
import {type as schema} from "arktype";

export const QuoteSchema = schema({
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

export const QuotesCalls = defineComponentCalls({
    id: "quotes",
    calls: {
        "create": {
            input: schema({
                content: "string",
                author_discord_user_id: "string",
                author_display_name: "string",
                saved_by_user_id: "string",
                saved_by_discord_user_id: "string",
                source_message_id: "string | null",
            }),
            output: QuoteSchema,
        },
        "delete": {
            input: schema({quote_id: "string", deleted_by_discord_user_id: "string"}),
            output: schema({deleted: "boolean"}),
        },
        "random": {
            input: schema({"author_discord_user_id?": "string"}),
            output: QuoteSchema.or("null"),
        },
        "search": {
            input: schema({query: "string"}),
            output: schema({quotes: QuoteSchema.array()}),
        },
        "get_reaction_config": {
            input: schema({}),
            output: schema({
                board_channel_id: "string",
                reaction_emoji: "string",
                reaction_threshold: "number",
            }),
        },
        "list": {
            input: schema({"author_discord_user_id?": "string", "page": "number"}),
            output: schema({quotes: QuoteSchema.array(), total_pages: "number"}),
        },
    },
});
