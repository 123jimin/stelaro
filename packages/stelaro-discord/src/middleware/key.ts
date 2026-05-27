import type {BaseInteraction} from "discord.js";

/**
 * Extracts a string key from a Discord interaction for rate limiting or concurrency control.
 *
 * @category Middleware
 */
export type KeyExtractor = (interaction: BaseInteraction) => string;

/**
 * Extracts the user id from an interaction.
 *
 * @param interaction - Discord interaction
 * @returns The user's id
 * @category Middleware
 */
export function perUser(interaction: BaseInteraction): string {
    return interaction.user.id;
}

/**
 * Extracts the guild id from an interaction, or `"dm"` for direct messages.
 *
 * @param interaction - Discord interaction
 * @returns The guild id or `"dm"`
 * @category Middleware
 */
export function perGuild(interaction: BaseInteraction): string {
    return interaction.guildId ?? "dm";
}

/**
 * Extracts the channel id from an interaction, or `"unknown"` if unavailable.
 *
 * @param interaction - Discord interaction
 * @returns The channel id or `"unknown"`
 * @category Middleware
 */
export function perChannel(interaction: BaseInteraction): string {
    return interaction.channelId ?? "unknown";
}
