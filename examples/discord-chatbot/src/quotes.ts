import {defineComponent, defineComponentCalls} from "@jiminp/peranto";
import {
    command,
    defineDiscordMounts,
    event,
    interaction,
} from "@jiminp/peranto-discord";
import {type as schema} from "arktype";
import {
    ActionRowBuilder,
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    Events,
    SlashCommandBuilder,
} from "discord.js";

import {appendJsonl, readJsonl} from "./storage.ts";
import {UsersCalls} from "./users.ts";

const DATA_PATH = "data/quotes.jsonl";
const QUOTES_PER_PAGE = 10;

type QuoteRecord = {
    quote_id: string;
    content: string;
    author_discord_user_id: string;
    author_display_name: string;
    saved_by_user_id: string;
    saved_by_discord_user_id: string;
    source_message_id: string | null;
    created_at: string;
};

const QuoteSchema = schema({
    quote_id: "string",
    content: "string",
    author_discord_user_id: "string",
    author_display_name: "string",
    saved_by_user_id: "string",
    saved_by_discord_user_id: "string",
    source_message_id: "string | null",
    created_at: "string",
});

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

// ─── Gateway mounts ─────────────────────────────────────────

function buildQuoteEmbed(quote: typeof QuoteSchema.infer) {
    return new EmbedBuilder()
        .setDescription(quote.content)
        .setFooter({text: `by ${quote.author_display_name}`})
        .setTimestamp(new Date(quote.created_at));
}

function buildDeleteRow(quote_id: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`quote:delete:${quote_id}`)
            .setLabel("Delete")
            .setStyle(ButtonStyle.Danger),
    );
}

function buildPaginationRow(user_filter: string, page: number, total_pages: number) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`quote:list:${user_filter}:${page - 1}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`quote:list:${user_filter}:${page + 1}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= total_pages - 1),
    );
}

export const QuotesMounts = defineDiscordMounts({
    uses: [QuotesCalls, UsersCalls],
    commands: [
        command({
            data: new SlashCommandBuilder()
                .setName("quote")
                .setDescription("Quote board commands")
                .addSubcommand((sub) => sub
                    .setName("random")
                    .setDescription("Get a random quote")
                    .addUserOption((opt) => opt
                        .setName("user")
                        .setDescription("Filter by quoted user")))
                .addSubcommand((sub) => sub
                    .setName("search")
                    .setDescription("Search quotes")
                    .addStringOption((opt) => opt
                        .setName("query")
                        .setDescription("Search query")
                        .setRequired(true)
                        .setAutocomplete(true)))
                .addSubcommand((sub) => sub
                    .setName("list")
                    .setDescription("List quotes")
                    .addUserOption((opt) => opt
                        .setName("user")
                        .setDescription("Filter by quoted user"))),

            async handle({interaction, call}) {
                const sub = interaction.options.getSubcommand();

                if(sub === "random") {
                    const target_user = interaction.options.getUser("user");
                    const quote = await call(QuotesCalls.calls.random, {
                        author_discord_user_id: target_user?.id,
                    });
                    if(quote == null) {
                        await interaction.reply({content: "No quotes found.", ephemeral: true});
                        return;
                    }
                    await interaction.reply({
                        embeds: [buildQuoteEmbed(quote)],
                        components: [buildDeleteRow(quote.quote_id)],
                    });
                    return;
                }

                if(sub === "search") {
                    const query = interaction.options.getString("query", true);
                    const {quotes} = await call(QuotesCalls.calls.search, {query});
                    if(quotes.length === 0) {
                        await interaction.reply({content: "No quotes match that search.", ephemeral: true});
                        return;
                    }
                    const embed = new EmbedBuilder()
                        .setTitle(`Search results for "${query}"`)
                        .setDescription(
                            quotes.map((q) => `> ${q.content}\n— ${q.author_display_name}`).join("\n\n"),
                        );
                    await interaction.reply({embeds: [embed]});
                    return;
                }

                if(sub === "list") {
                    const target_user = interaction.options.getUser("user");
                    const user_filter = target_user?.id ?? "*";
                    const {quotes, total_pages} = await call(QuotesCalls.calls.list, {
                        author_discord_user_id: target_user?.id,
                        page: 0,
                    });
                    if(quotes.length === 0) {
                        await interaction.reply({content: "No quotes found.", ephemeral: true});
                        return;
                    }
                    const embed = new EmbedBuilder()
                        .setTitle(target_user != null ? `Quotes by ${target_user.displayName}` : "All quotes")
                        .setDescription(
                            quotes.map((q) => `> ${q.content}\n— ${q.author_display_name}`).join("\n\n"),
                        )
                        .setFooter({text: `Page 1 / ${total_pages}`});
                    await interaction.reply({
                        embeds: [embed],
                        components: [buildPaginationRow(user_filter, 0, total_pages)],
                    });
                    return;
                }
            },

            async autocomplete({interaction, call}) {
                const focused = interaction.options.getFocused();
                const {quotes} = await call(QuotesCalls.calls.search, {query: focused});
                await interaction.respond(
                    quotes.slice(0, 25).map((q) => ({
                        name: q.content.length > 100 ? q.content.slice(0, 97) + "..." : q.content,
                        value: q.content,
                    })),
                );
            },
        }),

        command({
            data: new ContextMenuCommandBuilder()
                .setName("Save as Quote")
                .setType(ApplicationCommandType.Message)
                .setDMPermission(false),

            async handle({interaction, call}) {
                const message = interaction.targetMessage;
                const {user_id} = await call(UsersCalls.calls.resolve, {
                    discord_user_id: interaction.user.id,
                    display_name: interaction.user.displayName,
                });
                const quote = await call(QuotesCalls.calls.create, {
                    content: message.content,
                    author_discord_user_id: message.author.id,
                    author_display_name: message.author.displayName,
                    saved_by_user_id: user_id,
                    saved_by_discord_user_id: interaction.user.id,
                    source_message_id: message.id,
                });
                await interaction.reply({
                    content: "Quote saved!",
                    embeds: [buildQuoteEmbed(quote)],
                    components: [buildDeleteRow(quote.quote_id)],
                    ephemeral: true,
                });
            },
        }),
    ],

    events: [
        event({
            type: Events.MessageReactionAdd,
            async handle({event: [reaction, user], call, client}) {
                if(user.bot) return;

                const reaction_config = await call(QuotesCalls.calls.get_reaction_config, {});

                const emoji_name = reaction.emoji.name;
                if(emoji_name !== reaction_config.reaction_emoji) return;

                const full_reaction = reaction.partial
                    ? await reaction.fetch()
                    : reaction;
                if(full_reaction.count == null || full_reaction.count < reaction_config.reaction_threshold) return;

                const message = full_reaction.message.partial
                    ? await full_reaction.message.fetch()
                    : full_reaction.message;

                const {user_id} = await call(UsersCalls.calls.resolve, {
                    discord_user_id: user.id,
                    display_name: user.displayName,
                });

                const quote = await call(QuotesCalls.calls.create, {
                    content: message.content,
                    author_discord_user_id: message.author.id,
                    author_display_name: message.author.displayName,
                    saved_by_user_id: user_id,
                    saved_by_discord_user_id: user.id,
                    source_message_id: message.id,
                });

                const board_channel = await client.channels.fetch(reaction_config.board_channel_id);
                if(board_channel?.isTextBased()) {
                    await board_channel.send({
                        embeds: [buildQuoteEmbed(quote)],
                    });
                }
            },
        }),
    ],

    interactions: [
        interaction({
            pattern: "quote:delete:*",
            async handle({interaction, call, params}) {
                const [quote_id] = params;
                const {deleted} = await call(QuotesCalls.calls.delete, {
                    quote_id: quote_id!,
                    deleted_by_discord_user_id: interaction.user.id,
                });
                if(deleted) {
                    await interaction.update({content: "Quote deleted.", embeds: [], components: []});
                } else {
                    await interaction.reply({content: "You can only delete quotes you saved.", ephemeral: true});
                }
            },
        }),

        interaction({
            pattern: "quote:list:*:*",
            async handle({interaction, call, params}) {
                const [user_filter, page_str] = params;
                const page = parseInt(page_str!, 10);
                const author_discord_user_id = user_filter === "*" ? undefined : user_filter;
                const {quotes, total_pages} = await call(QuotesCalls.calls.list, {
                    author_discord_user_id,
                    page,
                });
                const embed = new EmbedBuilder()
                    .setTitle(author_discord_user_id != null ? `Quotes by user` : "All quotes")
                    .setDescription(
                        quotes.length > 0
                            ? quotes.map((q) => `> ${q.content}\n— ${q.author_display_name}`).join("\n\n")
                            : "No quotes on this page.",
                    )
                    .setFooter({text: `Page ${page + 1} / ${total_pages}`});
                await interaction.update({
                    embeds: [embed],
                    components: [buildPaginationRow(user_filter!, page, total_pages)],
                });
            },
        }),
    ],
});
