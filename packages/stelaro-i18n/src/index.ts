import type {IntlShape} from "@formatjs/intl";
import {createIntl, createIntlCache} from "@formatjs/intl";
import type {OptionalIfVoid} from "@jiminp/tooltool";

import type {MessageDescriptor, MessageValues} from "./message.ts";
import {catalogKey} from "./message.ts";

export type {MessageDescriptor, MessageValues, PrimitiveValue} from "./message.ts";
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

/**
 * Create a localization holder with immediate access to its seed catalogs.
 *
 * @param options - Source locale, seed catalogs, and catalog loading options
 * @returns A holder that can translate immediately and load more messages later
 * @throws {RangeError} The source locale is malformed.
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
    // Validate the source locale now because formatters are created lazily.
    Intl.getCanonicalLocales(default_locale);

    const cache = createIntlCache();
    const shapes = new Map<Locale, IntlShape>();
    const catalog_locales = [...new Set(locales)];
    let catalogs = new Map<Locale, Catalog>();
    let logger: Logger | null = null;

    for(const [locale, catalog] of Object.entries(messages)) {
        if(catalog != null) {
            catalogs.set(locale, {...catalog});
        }
    }

    function handleError(error: unknown): void {
        try {
            (logger ?? console).error(error);
        } catch{
            // A logger failure must not interrupt translation fallback.
        }
    }

    function shapeFor(locale: Locale): IntlShape {
        let shape = shapes.get(locale);
        if(shape == null) {
            shape = createIntl({locale, defaultLocale: default_locale, onError: handleError}, cache);
            shapes.set(locale, shape);
        }
        return shape;
    }

    async function load(read: CatalogReader, log?: Logger): Promise<void> {
        logger = log ?? null;
        const loaded = await Promise.all(catalog_locales.map(async (locale) => {
            const path = `${catalog_dir}/${locale}.json`;
            const catalog = await read(path);
            if(catalog == null) {
                return {locale, catalog: null};
            }
            if(typeof catalog !== "object" || Array.isArray(catalog)
                || Object.values(catalog).some((message) => typeof message !== "string")) {
                throw new TypeError(`Expected a string catalog at "${path}".`);
            }
            return {locale, catalog: catalog as Catalog};
        }));
        const next = new Map(catalogs);
        for(const {locale, catalog} of loaded) {
            if(catalog != null) {
                next.set(locale, {...next.get(locale), ...catalog});
            }
        }
        catalogs = next;
    }

    function format(locale: Locale, text: string, values: Record<string, unknown>): string | null {
        try {
            // Format each candidate separately so a failed translation cannot become verbatim output.
            const intl = shapeFor(locale);
            const formatter = intl.formatters.getMessageFormat(text, intl.locale, intl.formats, {
                formatters: intl.formatters,
                ignoreTag: true,
            });
            const output = formatter.format<unknown>(values);
            return Array.isArray(output) ? output.join("") : String(output ?? "");
        } catch (error) {
            handleError(error);
            return null;
        }
    }

    function t(locale: Locale, message: MessageDescriptor, values?: unknown): string {
        const key = catalogKey(message);
        const interpolation: Record<string, unknown> = Object.assign(Object.create(null), values);
        const catalog = catalogs.get(locale);
        const translation = catalog != null && Object.hasOwn(catalog, key) ? catalog[key] : null;
        return (translation == null ? null : format(locale, translation, interpolation))
            ?? (message.defaultMessage ? format(default_locale, message.defaultMessage, interpolation) : null)
            ?? key;
    }

    return {
        load,
        t,
        bind(locale) {
            return {locale, t: (message, ...[values]) => t(locale, message, values)};
        },
    };
}
