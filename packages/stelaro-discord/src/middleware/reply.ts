import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    ContextMenuCommandInteraction,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
} from "discord.js";

/** Union of interaction types that support `reply` and `followUp`. */
export type RepliableInteraction = ChatInputCommandInteraction | ContextMenuCommandInteraction
    | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

/**
 * Sends an ephemeral error message, choosing the reply method based on interaction state.
 *
 * Uses `followUp` if the interaction was already replied or deferred, otherwise `reply`.
 * Silently ignores failures (e.g. expired interactions).
 *
 * @param interaction - The interaction to reply to
 * @param message - Error message content
 */
export async function replyUserError(
    interaction: RepliableInteraction,
    message: string,
): Promise<void> {
    const payload = {content: message, ephemeral: true} as const;
    try {
        if(interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch{
        // Interaction may have expired
    }
}
