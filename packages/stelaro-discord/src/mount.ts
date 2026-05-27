import type {AnyComponentCalls} from "@jiminp/stelaro";

import type {CommandDefinition} from "./command.ts";
import type {EventDefinition} from "./event.ts";
import type {InteractionDefinition} from "./interaction.ts";
import type {Guard} from "./middleware/guard.ts";

/**
 * Groups commands, events, and interactions that share the same `uses` dependencies.
 *
 * @typeParam TUses - Declared component call surfaces
 * @category Mounts
 */
export type DiscordMountGroup<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
> = {
    /** Component call surfaces available to handlers in this group */
    readonly uses: TUses;
    /** Slash and context-menu command definitions */
    readonly commands?: readonly CommandDefinition<TUses>[];
    /** Discord gateway event handlers */
    readonly events?: readonly EventDefinition<TUses>[];
    /** Component interaction handlers (buttons, selects, modals) */
    readonly interactions?: readonly InteractionDefinition<TUses>[];
    /** Guards applied to all commands and interactions in this mount */
    readonly guards?: readonly Guard[];
};

/**
 * Creates a {@link DiscordMountGroup} with preserved generic inference.
 *
 * @param definition - Mount group definition
 * @returns The same definition with preserved type parameters
 * @category Mounts
 */
export function defineDiscordMounts<
    const TUses extends readonly AnyComponentCalls[],
>(definition: DiscordMountGroup<TUses>): DiscordMountGroup<TUses> {
    return definition;
}
