import type {MessageValue} from "@formatjs/intl";

/**
 * A source message and its optional translation metadata.
 *
 * @category Localization
 */
export type MessageDescriptor = {
    /** The explicit catalog key, when supplied. */
    readonly id?: string;
    /** The source ICU message used as fallback text. */
    readonly defaultMessage: string;
    /** The context provided to translators. */
    readonly description?: string;
};

type Whitespace = " " | "\t" | "\r" | "\n";
type Trim<S extends string> =
    S extends `${Whitespace}${infer Rest}` | `${infer Rest}${Whitespace}` ? Trim<Rest> : S;

// ICU apostrophes quote syntax characters, and a doubled apostrophe is literal.
type AfterQuotedText<S extends string> =
    S extends `${string}'${infer Rest}`
        ? Rest extends `'${infer Tail}` ? AfterQuotedText<Tail> : Rest
        : "";

type Unquoted<S extends string, Text extends string = ""> =
    S extends `${infer Before}'${infer Rest}`
        ? Rest extends `'${infer Tail}`
            ? Unquoted<Tail, `${Text}${Before}''`>
            : Rest extends `${"{" | "}"}${string}`
                ? Unquoted<AfterQuotedText<Rest>, `${Text}${Before}`>
                : Unquoted<Rest, `${Text}${Before}'`>
        : `${Text}${S}`;

type PlainValue = Exclude<MessageValue, undefined>;
type Field = [name: string, format: string | null];

type PlaceholderField<S extends string> =
    S extends `${infer Name},${infer Format}`
        ? [Trim<Name>, Trim<Format extends `${infer Kind},${string}` ? Kind : Format>]
        : [Trim<S>, null];

type PlaceholderFields<S extends string, Fields extends Field = never> =
    string extends S ? Field
        : S extends `${string}{${infer Inner}}${infer Rest}`
            ? PlaceholderFields<Rest, Fields | PlaceholderField<Inner>>
            : Fields;

type ValuesFor<Fields extends Field> =
    [Fields] extends [never] ? void
        : Fields[1] extends "number" | "date" | "time" | null
            ? {
                    [Name in Fields[0]]:
                    ([Name, "number"] extends Fields ? number | bigint : PlainValue)
                    & (Extract<Fields, [Name, "date" | "time"]> extends never ? PlainValue : number | Date);
                }
            : Record<string, unknown>;

/**
 * The interpolation values inferred from a source ICU message.
 *
 * @typeParam S - Source message text
 *
 * @remarks
 * Plain placeholders infer required names.
 * Number, date, and time placeholders also constrain the value type.
 * Plural and select messages and strings of unknown content accept a loose record.
 *
 * @category Localization
 */
export type MessageValues<S extends string> = ValuesFor<PlaceholderFields<Unquoted<S>>>;

/**
 * Declare source messages while preserving each literal descriptor for translation.
 *
 * @typeParam T - Named source descriptors
 * @param messages - Descriptors authored together for translation
 * @returns The supplied descriptors
 *
 * @category Localization
 */
export function defineMessages<const T extends Record<string, MessageDescriptor>>(messages: T): T {
    return messages;
}

/**
 * Get the key used to look up a descriptor in a locale catalog.
 *
 * @param descriptor - Source message and optional explicit ID
 * @returns The explicit ID when present, otherwise the source text
 *
 * @category Localization
 */
export function catalogKey(descriptor: MessageDescriptor): string {
    return descriptor.id ?? descriptor.defaultMessage;
}
