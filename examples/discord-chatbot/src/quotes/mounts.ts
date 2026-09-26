import {
    defineDiscordCommand,
    defineDiscordEvent,
    defineDiscordInteraction,
    defineDiscordMounts,
} from "@jiminp/stelaro-discord";
import {
    ActionRowBuilder,
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    Events,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";

import {UsersCalls} from "../users.ts";
import {type QuoteRecord, QuotesCalls, type QuoteSchema} from "./calls.ts";

const EMBED_TITLE_LIMIT = 256;
const EMBED_DESCRIPTION_LIMIT = 4096;
const CHOICE_LIMIT = 100;
const LIST_ENTRY_CONTENT_LIMIT = 300;

function truncate(text: string, max_length: number): string {
    return text.length <= max_length ? text : text.slice(0, max_length - 1) + "…";
}

function buildQuoteEmbed(quote: typeof QuoteSchema.infer) {
    return new EmbedBuilder()
        .setDescription(truncate(quote.content, EMBED_DESCRIPTION_LIMIT))
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

function formatQuoteList(quotes: QuoteRecord[]): string {
    if(quotes.length === 0) return "No quotes on this page.";
    const entries = quotes.map((q) => `> ${truncate(q.content, LIST_ENTRY_CONTENT_LIMIT)}\n— ${q.author_display_name}`);
    return truncate(entries.join("\n\n"), EMBED_DESCRIPTION_LIMIT);
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
        defineDiscordCommand({
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
                        ...(target_user != null ? {author_discord_user_id: target_user.id} : {}),
                    });
                    if(quote == null) {
                        await interaction.reply({content: "No quotes found.", flags: MessageFlags.Ephemeral});
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
                        await interaction.reply({content: "No quotes match that search.", flags: MessageFlags.Ephemeral});
                        return;
                    }
                    const embed = new EmbedBuilder()
                        .setTitle(truncate(`Search results for "${query}"`, EMBED_TITLE_LIMIT))
                        .setDescription(formatQuoteList(quotes));
                    await interaction.reply({embeds: [embed]});
                    return;
                }

                if(sub === "list") {
                    const target_user = interaction.options.getUser("user");
                    const user_filter = target_user?.id ?? "*";
                    const {quotes, total_pages} = await call(QuotesCalls.calls.list, {
                        ...(target_user != null ? {author_discord_user_id: target_user.id} : {}),
                        page: 0,
                    });
                    if(quotes.length === 0) {
                        await interaction.reply({content: "No quotes found.", flags: MessageFlags.Ephemeral});
                        return;
                    }
                    const embed = new EmbedBuilder()
                        .setTitle(target_user != null ? `Quotes by ${target_user.displayName}` : "All quotes")
                        .setDescription(formatQuoteList(quotes))
                        .setFooter({text: `Page 1 / ${total_pages}`});
                    await interaction.reply({
                        embeds: [embed],
                        components: [buildPaginationRow(user_filter, 0, total_pages)],
                    });
                    return;
                }
            },

            autocomplete: {
                async query({value, call}) {
                    const {quotes} = await call(QuotesCalls.calls.search, {query: value});
                    return quotes
                        .filter((q) => q.content.trim() !== "")
                        .map((q) => ({
                            name: truncate(q.content, CHOICE_LIMIT),
                            // A prefix of the content still matches the substring search.
                            value: q.content.slice(0, CHOICE_LIMIT),
                        }));
                },
            },
        }),

        defineDiscordCommand({
            data: new ContextMenuCommandBuilder()
                .setName("Save as Quote")
                .setType(ApplicationCommandType.Message)
                .setContexts(InteractionContextType.Guild),

            async handle({interaction, call}) {
                if(!interaction.isMessageContextMenuCommand()) return;
                const message = interaction.targetMessage;
                if(message.content.trim() === "") {
                    await interaction.reply({content: "Only messages with text can be saved.", flags: MessageFlags.Ephemeral});
                    return;
                }
                const {user_id} = await call(UsersCalls.calls.resolve, {
                    discord_user_id: interaction.user.id,
                    display_name: interaction.user.displayName,
                });
                const {quote, created} = await call(QuotesCalls.calls.create, {
                    content: message.content,
                    author_discord_user_id: message.author.id,
                    author_display_name: message.author.displayName,
                    saved_by_user_id: user_id,
                    saved_by_discord_user_id: interaction.user.id,
                    source_message_id: message.id,
                });
                await interaction.reply({
                    content: created ? "Quote saved!" : "This message is already saved.",
                    embeds: [buildQuoteEmbed(quote)],
                    components: [buildDeleteRow(quote.quote_id)],
                    flags: MessageFlags.Ephemeral,
                });
            },
        }),
    ],

    events: [
        defineDiscordEvent({
            type: Events.MessageReactionAdd,
            async handle({event: [reaction, user], call, client}) {
                if(user.bot) return;

                const reaction_config = await call(QuotesCalls.calls.getReactionConfig, {});

                const emoji_name = reaction.emoji.name;
                if(emoji_name !== reaction_config.reaction_emoji) return;

                const full_reaction = reaction.partial
                    ? await reaction.fetch()
                    : reaction;
                // Only the reaction that reaches the threshold saves; `create` dedupes re-crossings.
                if(full_reaction.count !== reaction_config.reaction_threshold) return;

                const message = full_reaction.message.partial
                    ? await full_reaction.message.fetch()
                    : full_reaction.message;
                if(message.content.trim() === "") return;

                const {user_id} = await call(UsersCalls.calls.resolve, {
                    discord_user_id: user.id,
                    display_name: user.displayName,
                });

                const {quote, created} = await call(QuotesCalls.calls.create, {
                    content: message.content,
                    author_discord_user_id: message.author.id,
                    author_display_name: message.author.displayName,
                    saved_by_user_id: user_id,
                    saved_by_discord_user_id: user.id,
                    source_message_id: message.id,
                });
                if(!created) return;

                const board_channel = await client.channels.fetch(reaction_config.board_channel_id);
                if(board_channel?.isSendable()) {
                    await board_channel.send({
                        embeds: [buildQuoteEmbed(quote)],
                    });
                }
            },
        }),
    ],

    interactions: [
        defineDiscordInteraction({
            pattern: "quote:delete:{quote_id}",
            async handle({interaction, call, params}) {
                if(!interaction.isButton()) return;
                const {deleted} = await call(QuotesCalls.calls.delete, {
                    quote_id: params.quote_id,
                    deleted_by_discord_user_id: interaction.user.id,
                });
                if(deleted) {
                    await interaction.update({content: "Quote deleted.", embeds: [], components: []});
                } else {
                    await interaction.reply({content: "You can only delete quotes you saved.", flags: MessageFlags.Ephemeral});
                }
            },
        }),

        defineDiscordInteraction({
            pattern: "quote:list:{user_filter}:{page}",
            async handle({interaction, call, params}) {
                if(!interaction.isButton()) return;
                const page = parseInt(params.page, 10);
                const user_filter = params.user_filter !== "*" ? params.user_filter : null;
                const {quotes, total_pages} = await call(QuotesCalls.calls.list, {
                    ...(user_filter != null ? {author_discord_user_id: user_filter} : {}),
                    page,
                });
                const embed = new EmbedBuilder()
                    .setTitle(user_filter != null ? `Quotes by user` : "All quotes")
                    .setDescription(formatQuoteList(quotes))
                    .setFooter({text: `Page ${page + 1} / ${total_pages}`});
                await interaction.update({
                    embeds: [embed],
                    components: [buildPaginationRow(params.user_filter, page, total_pages)],
                });
            },
        }),
    ],
});
