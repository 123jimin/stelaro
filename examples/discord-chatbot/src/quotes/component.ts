import {defineComponent} from "@jiminp/peranto";
import {type as schema} from "arktype";

import {appendJsonl, readJsonl} from "../storage.ts";
import {type QuoteRecord, QuotesCalls} from "./calls.ts";

const DATA_PATH = "data/quotes.jsonl";
const QUOTES_PER_PAGE = 10;

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
            async handle(_context, input) {
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
                await appendJsonl(DATA_PATH, record);
                return record;
            },
        },
        "delete": {
            async handle(_context, input) {
                const quotes = await readJsonl<QuoteRecord>(DATA_PATH);
                const quote = quotes.find((q) => q.quote_id === input.quote_id);
                if(quote == null || quote.saved_by_discord_user_id !== input.deleted_by_discord_user_id) {
                    return {deleted: false};
                }
                // Simplified: rewrite file without the deleted quote
                const {writeFile} = await import("node:fs/promises");
                const remaining = quotes.filter((q) => q.quote_id !== input.quote_id);
                await writeFile(DATA_PATH, remaining.map((q) => JSON.stringify(q)).join("\n") + "\n", "utf-8");
                return {deleted: true};
            },
        },
        "random": {
            async handle(_context, input) {
                const quotes = await readJsonl<QuoteRecord>(DATA_PATH);
                const filtered = input.author_discord_user_id != null
                    ? quotes.filter((q) => q.author_discord_user_id === input.author_discord_user_id)
                    : quotes;
                if(filtered.length === 0) return null;
                return filtered[Math.floor(Math.random() * filtered.length)] ?? null;
            },
        },
        "search": {
            async handle(_context, input) {
                const quotes = await readJsonl<QuoteRecord>(DATA_PATH);
                const lower_query = input.query.toLowerCase();
                const matches = quotes.filter(
                    (q) => q.content.toLowerCase().includes(lower_query)
                        || q.author_display_name.toLowerCase().includes(lower_query),
                );
                return {quotes: matches.slice(0, 25)};
            },
        },
        "get_reaction_config": {
            async handle(context) {
                return {
                    board_channel_id: context.config.board_channel_id,
                    reaction_emoji: context.config.reaction_emoji,
                    reaction_threshold: context.config.reaction_threshold,
                };
            },
        },
        "list": {
            async handle(_context, input) {
                const quotes = await readJsonl<QuoteRecord>(DATA_PATH);
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
