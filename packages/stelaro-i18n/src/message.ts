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

/**
 * A value accepted by the typed message interpolation API.
 *
 * @category Localization
 */
export type PrimitiveValue = string | number | boolean | Date;

type PlaceholderValues<S extends string, Names extends string> =
    S extends `${string}{${infer Inner}}${infer Rest}`
        ? Inner extends `${string},${string}`
            ? Record<string, PrimitiveValue>
            : PlaceholderValues<Rest, Names | Trim<Inner>>
        : [Names] extends [never] ? void : {[K in Names]: PrimitiveValue};

/**
 * The interpolation values inferred from a source ICU message.
 *
 * @typeParam S - Source message text
 *
 * @remarks
 * Plain placeholders infer required names.
 * Formatted placeholders and strings of unknown content use a loose record.
 *
 * @category Localization
 */
export type MessageValues<S extends string> =
    string extends S ? Record<string, PrimitiveValue> : PlaceholderValues<Unquoted<S>, never>;

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
