import {
    command,
    defineDiscordMounts,
    event,
    interaction,
} from "@jiminp/stelaro-discord";
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

import {UsersCalls} from "../users.ts";
import {type QuoteRecord, type QuoteSchema, QuotesCalls} from "./calls.ts";

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

function formatQuoteList(quotes: QuoteRecord[]): string {
    if(quotes.length === 0) return "No quotes on this page.";
    return quotes.map((q) => `> ${q.content}\n— ${q.author_display_name}`).join("\n\n");
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
                        ...(target_user != null ? {author_discord_user_id: target_user.id} : {}),
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
                        await interaction.reply({content: "No quotes found.", ephemeral: true});
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
                    return quotes.map((q) => q.content);
                },
            },
        }),

        command({
            data: new ContextMenuCommandBuilder()
                .setName("Save as Quote")
                .setType(ApplicationCommandType.Message)
                .setDMPermission(false),

            async handle({interaction, call}) {
                if(!interaction.isMessageContextMenuCommand()) return;
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
                if(board_channel?.isSendable()) {
                    await board_channel.send({
                        embeds: [buildQuoteEmbed(quote)],
                    });
                }
            },
        }),
    ],

    interactions: [
        interaction({
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
                    await interaction.reply({content: "You can only delete quotes you saved.", ephemeral: true});
                }
            },
        }),

        interaction({
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
