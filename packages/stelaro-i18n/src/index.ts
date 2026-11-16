import type {IntlShape} from "@formatjs/intl";
import {createIntl, createIntlCache} from "@formatjs/intl";
import type {OptionalIfVoid} from "@jiminp/tooltool";

import type {MessageDescriptor, MessageValues} from "./message.ts";
import {catalogKey} from "./message.ts";

export type {MessageDescriptor, MessageValues} from "./message.ts";
export {catalogKey, defineMessages} from "./message.ts";
export type {OptionalIfVoid} from "@jiminp/tooltool";

/**
 * A BCP-47 language tag.
 *
 * @category Localization
 */
export type Locale = string;

/**
 * A locale's translated ICU messages indexed by their catalog keys.
 *
 * @category Localization
 */
export type Catalog = Record<string, string>;

/**
 * A caller-supplied function that fetches or reads a parsed catalog.
 *
 * @param subpath - Catalog path relative to the caller's data root
 * @returns The parsed catalog, or a nullish value for a missing file
 *
 * @category Localization
 */
export type CatalogReader = (subpath: string) => Promise<unknown>;

/**
 * The logging methods available to a localization holder.
 *
 * @category Localization
 */
export type Logger = {
    /**
     * Emit a debug message.
     *
     * @param args - Values to log
     */
    debug(...args: unknown[]): void;

    /**
     * Emit an informational message.
     *
     * @param args - Values to log
     */
    info(...args: unknown[]): void;

    /**
     * Emit a warning.
     *
     * @param args - Values to log
     */
    warn(...args: unknown[]): void;

    /**
     * Emit an error.
     *
     * @param args - Values to log
     */
    error(...args: unknown[]): void;
};

/**
 * The source locale, catalog loading options, and in-memory seed messages.
 *
 * @category Localization
 */
export type I18nOptions = {
    /** The locale used to format source messages. */
    readonly default_locale: Locale;
    /** The locales requested by catalog loading, defaulting to the source locale alone. */
    readonly locales?: readonly Locale[];
    /** The catalog directory, defaulting to `i18n`. */
    readonly catalog_dir?: string;
    /** The per-locale catalogs available from construction. */
    readonly messages?: Readonly<Partial<Record<Locale, Catalog>>>;
};

/**
 * A locale-aware holder for loading and formatting messages.
 *
 * @category Localization
 */
export type I18n = {
    /**
     * Overlay catalogs for the configured locales.
     *
     * @param read - Callback `(subpath: string) => Promise<unknown>` that returns each parsed catalog
     * @param log - Logger for formatting errors (default: `console`)
     * @returns A promise that resolves when the catalogs are available
     * @throws {TypeError} The reader returns a non-null value other than a string catalog.
     *
     * @remarks
     * The caller's read errors propagate.
     */
    load(read: CatalogReader, log?: Logger): Promise<void>;

    /**
     * Format a message for an explicit locale.
     *
     * @typeParam D - Source message descriptor
     * @param locale - Requested language tag
     * @param message - Source message and catalog lookup metadata
     * @param values - Interpolation values for the source message
     * @returns The formatted translation, formatted source text, or literal catalog key
     */
    t<const D extends MessageDescriptor>(
        locale: Locale,
        message: D,
        ...values: OptionalIfVoid<MessageValues<NoInfer<D["defaultMessage"]>>>
    ): string;

    /**
     * Bind a translator to a locale.
     *
     * @typeParam L - Exact type of the requested language tag
     * @param locale - Requested language tag
     * @returns A translator that uses the supplied locale for each call
     */
    bind<L extends Locale>(locale: L): BoundI18n<L>;
};

/**
 * A translator that retains a particular requested locale.
 *
 * @typeParam L - Exact type of the bound language tag (default: `Locale`)
 *
 * @category Localization
 */
export type BoundI18n<L extends Locale = Locale> = {
    /** The requested language tag, including when formatting falls back to the source. */
    readonly locale: L;

    /**
     * Format a message for the bound locale.
     *
     * @typeParam D - Source message descriptor
     * @param message - Source message and catalog lookup metadata
     * @param values - Interpolation values for the source message
     * @returns The formatted translation, formatted source text, or literal catalog key
     */
    t<const D extends MessageDescriptor>(
        message: D,
        ...values: OptionalIfVoid<MessageValues<NoInfer<D["defaultMessage"]>>>
    ): string;
};

function isCatalog(value: unknown): value is Catalog {
    return value != null && typeof value === "object"
        && !Array.isArray(value)
        && Object.values(value).every((entry) => typeof entry === "string");
}

/**
 * Create a localization holder with immediate access to its seed catalogs.
 *
 * @param options - Source locale, seed catalogs, and catalog loading options
 * @returns A holder that can translate immediately and load more messages later
 *
 * @example
 * ```typescript
 * import {defineComponent, defineComponentCalls, defineLocalOutput, EmptyInput} from "@jiminp/stelaro";
 * import {createI18n, defineMessages} from "@jiminp/stelaro-i18n";
 *
 * const messages = defineMessages({greeting: {id: "greeting", defaultMessage: "Hello"}});
 * const calls = defineComponentCalls("greetings", {
 *     greet: {input: EmptyInput, output: defineLocalOutput<string>()},
 * });
 * export const greetings = defineComponent({
 *     calls,
 *     uses: [],
 *     state: () => createI18n({default_locale: "en", locales: ["fr"]}),
 *     start({state, data, log}) {
 *         return state.load((path) => data.read(path).optional().json(), log);
 *     },
 *     handlers: {
 *         greet: ({state}) => state.bind("fr").t(messages.greeting),
 *     },
 * });
 * ```
 *
 * @category Localization
 */
export function createI18n({
    default_locale,
    locales = [default_locale],
    catalog_dir = "i18n",
    messages = {},
}: I18nOptions): I18n {
    const cache = createIntlCache();
    const formatters = new Map<Locale, ReturnType<typeof createFormatter>>();
    const catalog_locales = [...new Set(locales)];
    let logger: Logger | null = null;

    function report(error: unknown): void {
        try {
            (logger ?? console).error(error);
        } catch{
            // A logger failure must not interrupt translation fallback.
        }
    }

    function createFormatter(locale: Locale, catalog: Catalog) {
        return {catalog, intl: createIntl({locale, defaultLocale: default_locale, messages: catalog, onError: report}, cache)};
    }

    for(const [locale, catalog] of Object.entries(messages)) {
        if(catalog != null) {
            formatters.set(locale, createFormatter(locale, {...catalog}));
        }
    }
    let source = formatters.get(default_locale) ?? createFormatter(default_locale, {});
    formatters.set(default_locale, source);

    async function load(read: CatalogReader, log?: Logger): Promise<void> {
        logger = log ?? null;
        const catalogs = await Promise.all(catalog_locales.map(async (locale) => {
            const path = `${catalog_dir}/${locale}.json`;
            const catalog = await read(path);
            if(catalog != null && !isCatalog(catalog)) {
                throw new TypeError(`Expected a string catalog at "${path}".`);
            }
            return {locale, catalog};
        }));
        const loaded = catalogs.flatMap(({locale, catalog}) => {
            if(catalog == null) {
                return [];
            }
            const previous = formatters.get(locale)?.catalog;
            return [[locale, createFormatter(locale, {...previous, ...catalog})]] as const;
        });
        for(const [locale, formatter] of loaded) {
            formatters.set(locale, formatter);
            if(locale === default_locale) {
                source = formatter;
            }
        }
    }

    function format(intl: IntlShape, text: string, values: Record<string, unknown>): string | null {
        try {
            // Format each candidate separately so a failed translation cannot become verbatim output.
            const formatter = intl.formatters.getMessageFormat(text, intl.locale, intl.formats, {
                formatters: intl.formatters,
                ignoreTag: true,
            });
            const output = formatter.format<unknown>(values);
            return Array.isArray(output) ? output.join("") : String(output ?? "");
        } catch (error) {
            report(error);
            return null;
        }
    }

    function t(locale: Locale, message: MessageDescriptor, values?: unknown): string {
        const key = catalogKey(message);
        const interpolation: Record<string, unknown> = Object.assign(Object.create(null), values);
        const entry = formatters.get(locale);
        if(entry != null && Object.hasOwn(entry.catalog, key)) {
            const translation = entry.catalog[key];
            if(translation != null) {
                const result = format(entry.intl, translation, interpolation);
                if(result != null) {
                    return result;
                }
            }
        }
        return message.defaultMessage
            ? format(source.intl, message.defaultMessage, interpolation) ?? key
            : key;
    }

    return {
        load,
        t,
        bind(locale) {
            return {locale, t: (message, ...[values]) => t(locale, message, values)};
        },
    };
}
