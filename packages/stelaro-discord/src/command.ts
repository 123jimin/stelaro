import type {AnyComponentCalls, ComponentCallFn, ComponentCallSchema} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import {
    ApplicationCommandOptionType,
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    type ContextMenuCommandBuilder,
    type ContextMenuCommandInteraction,
    type SlashCommandBuilder,
    type SlashCommandOptionsOnlyBuilder,
    type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

import type {ConcurrencyOptions} from "./middleware/concurrency.ts";
import type {Guard} from "./middleware/guard.ts";
import type {RateLimitOptions} from "./middleware/rate-limit.ts";
import type {BaseHandlerContext, SchemaOutput} from "./types.ts";

/**
 * Slash command builder types accepted as command data.
 *
 * @category Commands
 */
export type AnySlashCommandData = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;

type CommandInteractionOf<TData> =
    TData extends ContextMenuCommandBuilder ? ContextMenuCommandInteraction
        : ChatInputCommandInteraction;

/**
 * Context passed to a slash or context-menu command handler.
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TData - Command builder type that determines the interaction type (default: `SlashCommandBuilder | ContextMenuCommandBuilder`)
 * @typeParam TOptions - Optional schema for validated command options (default: `undefined`)
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
    call: ComponentCallFn<TUses>;
};

/**
 * Context passed to the single autocomplete handler of a command.
 *
 * @typeParam TUses - Declared component call surfaces
 * @category Commands
 */
export type AutocompleteFallbackContext<
    TUses extends readonly AnyComponentCalls[],
> = {
    /** The autocomplete interaction */
    readonly interaction: AutocompleteInteraction;
    /** Dispatches a typed call to a stelaro component */
    call: ComponentCallFn<TUses>;
};

/**
 * Autocomplete handler for a single option, returning the suggestions to show.
 *
 * @typeParam TUses - Declared component call surfaces
 * @category Commands
 */
export type AutocompleteHandler<TUses extends readonly AnyComponentCalls[]> =
    (context: AutocompleteHandlerContext<TUses>) => Promisable<AutocompleteResult>;

/**
 * Autocomplete handlers keyed by option name, or `subcommand/option` for subcommand options.
 *
 * @typeParam TUses - Declared component call surfaces
 * @category Commands
 */
export type AutocompleteMap<TUses extends readonly AnyComponentCalls[]> =
    Record<string, AutocompleteHandler<TUses>>;

/**
 * Single autocomplete handler used instead of a per-option map; it responds to the interaction itself.
 *
 * @typeParam TUses - Declared component call surfaces
 * @category Commands
 */
export type AutocompleteFallback<TUses extends readonly AnyComponentCalls[]> =
    (context: AutocompleteFallbackContext<TUses>) => Promisable<void>;

/**
 * Defines a slash or context-menu command with handler and optional autocomplete.
 *
 * @typeParam TUses - Declared component call surfaces (default: `readonly AnyComponentCalls[]`)
 * @typeParam TData - Command builder type (default: `AnySlashCommandData | ContextMenuCommandBuilder`)
 * @typeParam TOptions - Optional schema for validated command options (default: `ComponentCallSchema | undefined`)
 * @category Commands
 */
export type CommandDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TData extends AnySlashCommandData | ContextMenuCommandBuilder = AnySlashCommandData | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
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
 * Defines a command whose interaction and options are typed from its builder and schema.
 *
 * @typeParam TData - Command builder type
 * @typeParam TOptions - Options schema, if any (default: `undefined`)
 * @param definition - Command definition
 * @returns `definition`
 *
 * @remarks
 * The handler's `call` accepts any component's reference; the calls it makes are not checked
 * against the enclosing mount's `uses`.
 *
 * @example
 * ```ts
 * const ping = command({
 *     data: new SlashCommandBuilder().setName("ping").setDescription("Replies with pong"),
 *     async handle({interaction}) {
 *         await interaction.reply("pong");
 *     },
 * });
 * ```
 *
 * @category Commands
 */
export function command<
    TData extends AnySlashCommandData | ContextMenuCommandBuilder,
    TOptions extends ComponentCallSchema | undefined = undefined,
>(definition: CommandDefinition<readonly AnyComponentCalls[], TData, TOptions>): CommandDefinition {
    return definition;
}

const MAX_AUTOCOMPLETE_CHOICES = 25;
const MAX_AUTOCOMPLETE_TEXT_LENGTH = 100;

function truncateAutocompleteText(text: string, ellipsis: string): string {
    return text.length > MAX_AUTOCOMPLETE_TEXT_LENGTH
        ? text.slice(0, MAX_AUTOCOMPLETE_TEXT_LENGTH - ellipsis.length) + ellipsis
        : text;
}

/** Normalizes autocomplete results into at most 25 choices, ellipsizing names and cutting values to 100 characters. */
export function normalizeAutocompleteResult(result: AutocompleteResult): AutocompleteChoice[] {
    return result.slice(0, MAX_AUTOCOMPLETE_CHOICES).map((item) => {
        const {name, value} = typeof item === "string" ? {name: item, value: item} : item;
        // A cut value stays a prefix of the original, so handlers can still match it.
        return {name: truncateAutocompleteText(name, "..."), value: truncateAutocompleteText(value, "")};
    });
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

    if(data.length > 0 && (
        data[0]!.type === ApplicationCommandOptionType.Subcommand
        || data[0]!.type === ApplicationCommandOptionType.SubcommandGroup
    )) {
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
