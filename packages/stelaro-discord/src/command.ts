import type {AnyComponentCalls, ComponentCallSchema} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

import type {BaseHandlerContext, CallFn, SchemaOutput} from "./types.ts";

type AnySlashCommandData = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;

type CommandInteractionOf<TData> =
    TData extends ContextMenuCommandBuilder ? ContextMenuCommandInteraction
        : ChatInputCommandInteraction;

export type CommandHandlerContext<
    TUses extends readonly AnyComponentCalls[],
    TData = SlashCommandBuilder | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = undefined,
> = BaseHandlerContext<TUses> & {
    readonly interaction: CommandInteractionOf<TData>;
    readonly options: SchemaOutput<TOptions>;
};

export type AutocompleteChoice = {
    readonly name: string;
    readonly value: string;
};

export type AutocompleteResult = readonly string[] | readonly AutocompleteChoice[];

export type AutocompleteHandlerContext<
    TUses extends readonly AnyComponentCalls[],
> = {
    readonly value: string;
    readonly interaction: AutocompleteInteraction;
    call: CallFn<TUses>;
};

export type AutocompleteFallbackContext<
    TUses extends readonly AnyComponentCalls[],
> = {
    readonly interaction: AutocompleteInteraction;
    call: CallFn<TUses>;
};

export type AutocompleteHandler<TUses extends readonly AnyComponentCalls[]> =
    (context: AutocompleteHandlerContext<TUses>) => Promisable<AutocompleteResult>;

export type AutocompleteMap<TUses extends readonly AnyComponentCalls[]> =
    Record<string, AutocompleteHandler<TUses>>;

export type AutocompleteFallback<TUses extends readonly AnyComponentCalls[]> =
    (context: AutocompleteFallbackContext<TUses>) => Promisable<void>;

export type CommandDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TData extends AnySlashCommandData | ContextMenuCommandBuilder = AnySlashCommandData | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = undefined,
> = {
    readonly data: TData;
    readonly options?: TOptions;
    handle(context: CommandHandlerContext<TUses, TData, TOptions>): Promisable<void>;
    readonly autocomplete?: AutocompleteMap<TUses> | AutocompleteFallback<TUses>;
};

export function command<
    TData extends AnySlashCommandData | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = undefined,
>(definition: CommandDefinition<readonly AnyComponentCalls[], TData, TOptions>): CommandDefinition {
    return definition as unknown as CommandDefinition;
}

const MAX_AUTOCOMPLETE_NAME_LENGTH = 100;
const MAX_AUTOCOMPLETE_CHOICES = 25;

export function normalizeAutocompleteResult(result: AutocompleteResult): AutocompleteChoice[] {
    const choices: AutocompleteChoice[] = [];
    for(const item of result) {
        if(choices.length >= MAX_AUTOCOMPLETE_CHOICES) break;
        if(typeof item === "string") {
            choices.push({
                name: item.length > MAX_AUTOCOMPLETE_NAME_LENGTH
                    ? item.slice(0, MAX_AUTOCOMPLETE_NAME_LENGTH - 3) + "..."
                    : item,
                value: item,
            });
        } else {
            choices.push({
                name: item.name.length > MAX_AUTOCOMPLETE_NAME_LENGTH
                    ? item.name.slice(0, MAX_AUTOCOMPLETE_NAME_LENGTH - 3) + "..."
                    : item.name,
                value: item.value,
            });
        }
    }
    return choices;
}

export function extractCommandOptions(
    interaction: ChatInputCommandInteraction,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const data = interaction.options.data;

    if(data.length > 0 && (data[0]!.type === 1 || data[0]!.type === 2)) {
        result["sub"] = data[0]!.name;
        for(const opt of data[0]!.options ?? []) {
            result[opt.name] = extractOptionValue(opt);
        }
    } else {
        for(const opt of data) {
            result[opt.name] = extractOptionValue(opt);
        }
    }

    return result;
}

function extractOptionValue(opt: {
    value?: string | number | boolean;
    user?: {id: string};
    channel?: {id: string} | null;
    role?: {id: string} | null;
    attachment?: {id: string} | null;
}): unknown {
    if(opt.value != null) return opt.value;
    if(opt.user != null) return opt.user.id;
    if(opt.channel != null) return opt.channel.id;
    if(opt.role != null) return opt.role.id;
    if(opt.attachment != null) return opt.attachment.id;
    return null;
}
