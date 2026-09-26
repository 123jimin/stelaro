import type {Logger} from "@jiminp/stelaro";
import {MessageFlags, type RepliableInteraction} from "discord.js";

/** Sends an ephemeral message with `followUp` once replied or deferred, otherwise `reply`, logging failures. */
export async function replyUserError(
    interaction: RepliableInteraction,
    message: string,
    log: Logger,
): Promise<void> {
    const payload = {content: message, flags: MessageFlags.Ephemeral} as const;
    try {
        if(interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (error) {
        log.warn("Failed to send ephemeral error reply:", error);
    }
}
