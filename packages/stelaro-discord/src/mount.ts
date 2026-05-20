import type {AnyComponentCalls} from "@jiminp/stelaro";

import type {CommandDefinition} from "./command.ts";
import type {EventDefinition} from "./event.ts";
import type {InteractionDefinition} from "./interaction.ts";

export type DiscordMountGroup<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
> = {
    readonly uses: TUses;
    readonly commands?: readonly CommandDefinition<TUses>[];
    readonly events?: readonly EventDefinition<TUses>[];
    readonly interactions?: readonly InteractionDefinition<TUses>[];
};

export function defineDiscordMounts<
    const TUses extends readonly AnyComponentCalls[],
>(definition: DiscordMountGroup<TUses>): DiscordMountGroup<TUses> {
    return definition;
}
