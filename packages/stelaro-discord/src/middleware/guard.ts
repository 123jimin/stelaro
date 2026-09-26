import type {Promisable} from "@jiminp/tooltool";
import type {
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Client,
    ContextMenuCommandInteraction,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
} from "discord.js";

/**
 * Context passed to a guard function.
 *
 * @category Middleware
 */
export type GuardContext = {
    /** The command, autocomplete, or persistent component interaction being guarded */
    readonly interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction
        | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | AutocompleteInteraction;
    /** The Discord.js client instance */
    readonly client: Client;
};

/**
 * Pre-handler check that passes by returning and rejects by throwing `UserFacingError`.
 *
 * @remarks
 * For autocomplete, a rejection responds with empty choices instead of an ephemeral reply.
 *
 * @category Middleware
 */
export type Guard = (context: GuardContext) => Promisable<void>;

/** Runs guards in order, stopping at the first throw. */
export async function runGuards(guards: readonly Guard[], context: GuardContext): Promise<void> {
    for(const guard of guards) {
        await guard(context);
    }
}
