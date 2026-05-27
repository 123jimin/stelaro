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

import type {ConcurrencyOptions} from "./middleware/concurrency.ts";
import type {Guard} from "./middleware/guard.ts";
import type {RateLimitOptions} from "./middleware/rate-limit.ts";
import type {BaseHandlerContext, CallFn, SchemaOutput} from "./types.ts";

type AnySlashCommandData = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;

type CommandInteractionOf<TData> =
    TData extends ContextMenuCommandBuilder ? ContextMenuCommandInteraction
        : ChatInputCommandInteraction;

/**
 * Context passed to a slash or context-menu command handler.
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TData - Command builder type that determines the interaction type
 * @typeParam TOptions - Optional schema for validated command options
 * @category Commands
 */
export type CommandHandlerContext<
    TUses extends readonly AnyComponentCalls[],
    TData = SlashCommandBuilder | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = undefined,
> = BaseHandlerContext<TUses> & {
    /** The Discord interaction that triggered this command */
    readonly interaction: CommandInteractionOf<TData>;
    /** Validated command options, or `null` if no schema was provided */
    readonly options: SchemaOutput<TOptions>;
};

/** A single autocomplete suggestion returned to Discord.
 *
 * @category Commands
 */
export type AutocompleteChoice = {
    /** Display name shown to the user */
    readonly name: string;
    /** Value sent back when selected */
    readonly value: string;
};

/** Autocomplete result: an array of strings or {@link AutocompleteChoice} objects.
 *
 * @category Commands
 */
export type AutocompleteResult = readonly string[] | readonly AutocompleteChoice[];

/**
 * Context passed to a per-option autocomplete handler.
 *
 * @typeParam TUses - Declared component call surfaces
 * @category Commands
 */
export type AutocompleteHandlerContext<
    TUses extends readonly AnyComponentCalls[],
> = {
    /** Current value typed by the user */
    readonly value: string;
    /** The autocomplete interaction */
    readonly interaction: AutocompleteInteraction;
    /** Dispatches a typed call to a stelaro component */
    call: CallFn<TUses>;
};

/** Context passed to the autocomplete fallback handler. */
export type AutocompleteFallbackContext<
    TUses extends readonly AnyComponentCalls[],
> = {
    readonly interaction: AutocompleteInteraction;
    call: CallFn<TUses>;
};

/** An autocomplete handler for a single option. */
export type AutocompleteHandler<TUses extends readonly AnyComponentCalls[]> =
    (context: AutocompleteHandlerContext<TUses>) => Promisable<AutocompleteResult>;

/** Maps option names to their autocomplete handlers.
 *
 * @category Commands
 */
export type AutocompleteMap<TUses extends readonly AnyComponentCalls[]> =
    Record<string, AutocompleteHandler<TUses>>;

/** Fallback handler invoked when no per-option autocomplete handler matches. */
export type AutocompleteFallback<TUses extends readonly AnyComponentCalls[]> =
    (context: AutocompleteFallbackContext<TUses>) => Promisable<void>;

/**
 * Defines a slash or context-menu command with handler and optional autocomplete.
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TData - Command builder type
 * @typeParam TOptions - Optional schema for validated command options
 * @category Commands
 */
export type CommandDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TData extends AnySlashCommandData | ContextMenuCommandBuilder = AnySlashCommandData | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = undefined,
> = {
    /** Discord.js command builder with name, description, and options */
    readonly data: TData;
    /** Schema to validate extracted command options against */
    readonly options?: TOptions;
    /** Handles the command interaction */
    handle(context: CommandHandlerContext<TUses, TData, TOptions>): Promisable<void>;
    /** Per-option autocomplete map or a single fallback handler */
    readonly autocomplete?: AutocompleteMap<TUses> | AutocompleteFallback<TUses>;
    /** Pre-handler guards executed after gateway and mount guards */
    readonly guards?: readonly Guard[];
    /** Sliding-window rate limit for this command */
    readonly rate_limit?: RateLimitOptions;
    /** Per-key concurrency limit for this command */
    readonly concurrency?: ConcurrencyOptions;
};

/**
 * Creates a type-erased {@link CommandDefinition} for use in mount groups.
 *
 * @param definition - Command definition
 * @returns Type-erased command definition
 * @category Commands
 */
export function command<
    TData extends AnySlashCommandData | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = undefined,
>(definition: CommandDefinition<readonly AnyComponentCalls[], TData, TOptions>): CommandDefinition {
    return definition as unknown as CommandDefinition;
}

const MAX_AUTOCOMPLETE_NAME_LENGTH = 100;
const MAX_AUTOCOMPLETE_CHOICES = 25;

/**
 * Normalizes autocomplete results into choices, truncating names and capping at 25 entries.
 *
 * @param result - Raw autocomplete result from a handler
 * @returns Normalized choices safe to send to Discord
 */
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

/**
 * Extracts command options from a chat input interaction into a flat record.
 *
 * Subcommand names are placed under the `"sub"` key.
 *
 * @param interaction - The chat input command interaction
 * @returns Flat record of option names to values
 */
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
