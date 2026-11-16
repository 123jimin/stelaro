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

type LooseValues = Record<string, unknown>;
type PlainValue = Exclude<MessageValue, undefined>;

type Placeholder<S extends string> =
    S extends `${infer Name},${infer Format}`
        ? Trim<Format extends `${infer Kind},${string}` ? Kind : Format> extends infer Kind
            ? Kind extends "number" ? Record<Trim<Name>, number | bigint>
                : Kind extends "date" | "time" ? Record<Trim<Name>, number | Date>
                    : LooseValues
            : never
        : Record<Trim<S>, PlainValue>;

type CollectValues<S extends string, Values = Record<never, never>> =
    S extends `${string}{${infer Argument}}${infer Rest}`
        ? Placeholder<Argument> extends infer Field
            ? string extends keyof Field ? LooseValues : CollectValues<Rest, Values & Field>
            : never
        : Values;

type ValuesFor<S extends string> = S extends unknown ? CollectValues<Unquoted<S>> : never;
type IntersectValues<T> = (
    T extends unknown ? (values: T) => void : never
) extends (values: infer Values) => void ? Values : never;

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
export type MessageValues<S extends string> =
    string extends S ? LooseValues
        : IntersectValues<ValuesFor<S>> extends infer Values
            ? string extends keyof Values ? LooseValues
                : keyof Values extends never ? void
                    : {[K in keyof Values]: Values[K]}
            : never;

/**
 * An argument tuple that permits omission when the value type is void.
 *
 * @typeParam T - Value accepted by the argument
 *
 * @category Localization
 */
export type OptionalIfVoid<T> = [T] extends [void] ? [values?: T] : [values: T];

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
