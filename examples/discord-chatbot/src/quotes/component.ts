import {type DataAccess, defineComponent} from "@jiminp/stelaro";
import {type as schema} from "arktype";

import {appendJsonl, readJsonl} from "../storage.ts";
import {type QuoteRecord, QuotesCalls, QuoteSchema} from "./calls.ts";

const QUOTES_PATH = "quotes.jsonl";
const DELETIONS_PATH = "quote-deletions.jsonl";
const QUOTES_PER_PAGE = 10;

const DeletionSchema = schema({
    quote_id: "string",
    deleted_at: "string",
});

type DeletionRecord = typeof DeletionSchema.infer;

async function readQuotes(data: DataAccess): Promise<QuoteRecord[]> {
    const [quotes, deletions] = await Promise.all([
        readJsonl(data, QUOTES_PATH, QuoteSchema),
        readJsonl(data, DELETIONS_PATH, DeletionSchema),
    ]);
    const deleted_ids = new Set(deletions.map((d) => d.quote_id));
    return quotes.filter((q) => !deleted_ids.has(q.quote_id));
}

export const QuotesComponent = defineComponent({
    calls: QuotesCalls,
    uses: [],
    config: schema({
        board_channel_id: "string",
        reaction_emoji: "string",
        reaction_threshold: "number",
        max_quotes_per_user: "number",
    }),
    handlers: {
        "create": {
            async handle(context, input) {
                if(input.source_message_id != null) {
                    const quotes = await readQuotes(context.data);
                    const existing = quotes.find((q) => q.source_message_id === input.source_message_id);
                    if(existing != null) return {quote: existing, created: false};
                }
                const record: QuoteRecord = {
                    quote_id: crypto.randomUUID(),
                    content: input.content,
                    author_discord_user_id: input.author_discord_user_id,
                    author_display_name: input.author_display_name,
                    saved_by_user_id: input.saved_by_user_id,
                    saved_by_discord_user_id: input.saved_by_discord_user_id,
                    source_message_id: input.source_message_id,
                    created_at: new Date().toISOString(),
                };
                await appendJsonl(context.data, QUOTES_PATH, record);
                context.log.info(
                    {event: "quote.saved", quote_id: record.quote_id, saved_by_user_id: record.saved_by_user_id},
                    "Quote saved.",
                );
                return {quote: record, created: true};
            },
        },
        "delete": {
            async handle(context, input) {
                const quotes = await readQuotes(context.data);
                const quote = quotes.find((q) => q.quote_id === input.quote_id);
                if(quote == null || quote.saved_by_discord_user_id !== input.deleted_by_discord_user_id) {
                    return {deleted: false};
                }
                const deletion: DeletionRecord = {
                    quote_id: quote.quote_id,
                    deleted_at: new Date().toISOString(),
                };
                await appendJsonl(context.data, DELETIONS_PATH, deletion);
                context.log.info({event: "quote.deleted", quote_id: quote.quote_id}, "Quote deleted.");
                return {deleted: true};
            },
        },
        "random": {
            async handle(context, input) {
                const quotes = await readQuotes(context.data);
                const filtered = input.author_discord_user_id != null
                    ? quotes.filter((q) => q.author_discord_user_id === input.author_discord_user_id)
                    : quotes;
                if(filtered.length === 0) return null;
                return filtered[Math.floor(Math.random() * filtered.length)] ?? null;
            },
        },
        "search": {
            async handle(context, input) {
                const quotes = await readQuotes(context.data);
                const lower_query = input.query.toLowerCase();
                const matches = quotes.filter(
                    (q) => q.content.toLowerCase().includes(lower_query)
                        || q.author_display_name.toLowerCase().includes(lower_query),
                );
                return {quotes: matches.slice(0, 25)};
            },
        },
        "getReactionConfig": {
            async handle(context) {
                return {
                    board_channel_id: context.config.board_channel_id,
                    reaction_emoji: context.config.reaction_emoji,
                    reaction_threshold: context.config.reaction_threshold,
                };
            },
        },
        "list": {
            async handle(context, input) {
                const quotes = await readQuotes(context.data);
                const filtered = input.author_discord_user_id != null
                    ? quotes.filter((q) => q.author_discord_user_id === input.author_discord_user_id)
                    : quotes;
                filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
                const total_pages = Math.max(1, Math.ceil(filtered.length / QUOTES_PER_PAGE));
                const start = input.page * QUOTES_PER_PAGE;
                return {
                    quotes: filtered.slice(start, start + QUOTES_PER_PAGE),
                    total_pages,
                };
            },
        },
    },
});
