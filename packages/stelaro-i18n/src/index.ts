import {createIntl, createIntlCache, IntlErrorCode, type IntlShape} from "@formatjs/intl";
import type {Nullable, OptionalIfVoid} from "@jiminp/tooltool";

/** A BCP-47 language tag, e.g. `"en"`, `"ko"`, `"en-US"`.
 *
 * @category i18n
 */
export type Locale = string;

/**
 * A minimal structural logger. A component's `context.log` (`@jiminp/stelaro`) satisfies it, as does
 * `console`.
 *
 * @category i18n
 */
export type Logger = {
    /** Logs a debug-level message */
    debug(...args: unknown[]): void;
    /** Logs an info-level message */
    info(...args: unknown[]): void;
    /** Logs a warning-level message */
    warn(...args: unknown[]): void;
    /** Logs an error-level message */
    error(...args: unknown[]): void;
};

/**
 * Reads a catalog by subpath, resolving to its parsed JSON (or null/absent for a missing catalog).
 * The caller chooses the source: a component adapts its `DataAccess`, a browser uses `fetch`.
 *
 * @category i18n
 */
export type CatalogReader = (subpath: string) => Promise<unknown>;

/**
 * A source message: an optional id and its ICU MessageFormat source text.
 *
 * @category i18n
 */
export type MessageDescriptor = {
    /** Stable catalog key, unique within the component (default: `defaultMessage`) */
    readonly id?: string;
    /** ICU source text and the final fallback */
    readonly defaultMessage: string;
    /** Optional translator context, carried through extraction. Never part of the key. */
    readonly description?: string;
};

/**
 * A locale's runtime catalog: message id → translated string.
 *
 * @category i18n
 */
export type Catalog = Record<string, string>;

/**
 * Options for a component-scoped translator.
 *
 * @category i18n
 */
export type I18nOptions = {
    /** Well-formed tag of the locale the source text is written in; fallbacks are formatted in it */
    readonly default_locale: Locale;
    /**
     * Well-formed tags whose catalogs {@link I18n.load} reads, each requested as written
     * (default: `[default_locale]`)
     */
    readonly locales?: Nullable<readonly Locale[]>;
    /** Directory of the catalogs; the reader receives `{catalog_dir}/{locale}.json` (default: `"i18n"`) */
    readonly catalog_dir?: Nullable<string>;
    /**
     * Catalogs available before {@link I18n.load}, by well-formed tag; tags differing only in ASCII
     * case are one catalog. Ids loaded for the same locale replace seeded ones, and seed-only ids
     * remain. Seeded locales need not be in `locales`.
     */
    readonly messages?: Nullable<Readonly<Partial<Record<Locale, Catalog>>>>;
};

/** A value an ICU placeholder can interpolate.
 *
 * @category i18n
 */
export type PrimitiveValue = string | number | boolean | Date;

// Accumulates simple placeholder names; a comma inside any `{...}` means control syntax.
type PlaceholderValues<S extends string, Names extends string> =
    S extends `${string}{${infer Inner}}${infer Rest}`
        ? Inner extends `${string},${string}`
            ? Record<string, PrimitiveValue>
            : PlaceholderValues<Rest, Names | Inner>
        : [Names] extends [never] ? void : {[K in Names]: PrimitiveValue};

/**
 * The values an ICU source string interpolates: typed simple placeholders, a loose record for
 * plural/select syntax, or `void` when it has none.
 *
 * @typeParam S - ICU source text
 * @category i18n
 */
export type MessageValues<S extends string> = PlaceholderValues<S, never>;

/**
 * A component-scoped translator. Construct it synchronously with {@link createI18n}, load its
 * catalogs in the component's `start` hook, and call `t` from handlers.
 *
 * @category i18n
 */
export type I18n = {
    /**
     * Reads the catalogs of `locales` through `read` (a component adapts its `DataAccess`, a browser
     * uses `fetch`; a null or absent result is an empty catalog). Once every read succeeds, the
     * catalogs and `log`, which receives formatting failures instead of the console, replace the
     * previous ones. Rejects with the reader's error, or with `TypeError` for a result that is not
     * a plain object of strings, changing nothing.
     */
    load(read: CatalogReader, log?: Logger): Promise<void>;
    /**
     * Translates `message` for an explicit `locale`, matched case-insensitively against catalog
     * locales. Synchronous; falls back to the message's source (`defaultMessage`), formatted in
     * `default_locale`, when a translation is missing, before {@link I18n.load}, or for a locale
     * without a catalog, malformed ones included.
     */
    t<const D extends MessageDescriptor>(
        locale: Locale,
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
    ): string;
    /**
     * Returns a translator with `locale` fixed: `bind(locale).t(message, …)` is
     * `t(locale, message, …)`.
     */
    bind<L extends Locale>(locale: L): BoundI18n<L>;
};

/**
 * An {@link I18n} translator with the locale fixed by {@link I18n.bind}.
 *
 * @category i18n
 */
export type BoundI18n<L extends Locale = Locale> = {
    /** The exact locale passed to {@link I18n.bind}, even when translation falls back. */
    readonly locale: L;
    /**
     * Translates `message` for the bound locale. Same fallback chain and typing as {@link I18n.t}.
     */
    t<const D extends MessageDescriptor>(
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
    ): string;
};

function isWellFormedLocale(locale: Locale): boolean {
    try {
        Intl.getCanonicalLocales(locale);
        return true;
    } catch{
        return false;
    }
}

/** Returns a loaded `value` as a catalog, or throws `TypeError` unless it is a plain object of strings. */
function assertCatalog(subpath: string, value: unknown): Catalog {
    const is_catalog = typeof value === "object" && value !== null
        && [Object.prototype, null].includes(Object.getPrototypeOf(value))
        && Object.values(value).every((message) => typeof message === "string");
    if(!is_catalog) throw new TypeError(`Catalog "${subpath}" is not a plain object of strings.`);
    return value as Catalog;
}

/**
 * The catalog key {@link createI18n} looks a descriptor up by: its `id`, else its source text
 * (`defaultMessage`).
 *
 * @param descriptor - The source message
 * @returns The descriptor's catalog key
 * @category i18n
 */
export function catalogKey(descriptor: MessageDescriptor): string {
    return descriptor.id ?? descriptor.defaultMessage;
}

/** A catalog under the locale tag it was given with. */
type LocaleCatalog = {readonly locale: Locale; readonly messages: Catalog};

/** Folds only ASCII case, as BCP 47 does: `toLowerCase` maps some non-ASCII letters to ASCII
 *  (`"\u212A"` to `"k"`), which would let a malformed tag reach a catalog. */
function localeKey(locale: Locale): string {
    return locale.replace(/[A-Z]+/gu, (upper) => upper.toLowerCase());
}

/**
 * Creates a component-scoped {@link I18n} backed by FormatJS. Synchronous and safe to call inside
 * a component state factory; catalogs are read later by {@link I18n.load}.
 *
 * @param options - Default locale, loadable locales, catalog directory, and seeded catalogs
 * @returns A new {@link I18n} holder
 * @throws {RangeError} When `default_locale`, a `locales` entry, or a `messages` key is not a
 *   well-formed locale tag
 *
 * @example
 * ```ts
 * const GreeterComponent = defineComponent({
 *     calls: GreeterCalls,
 *     uses: [],
 *     state: () => ({i18n: createI18n({default_locale: "en", locales: ["en", "ko"]})}),
 *     async start(context) {
 *         await context.state.i18n.load((subpath) => context.data.read(subpath).optional().json(), context.log);
 *     },
 *     handlers: {
 *         greet: (context, input) => ({
 *             text: context.state.i18n.t(input.locale, {defaultMessage: "Hello, {name}!"}, {name: input.name}),
 *         }),
 *     },
 * });
 * ```
 *
 * @category i18n
 */
export function createI18n(options: I18nOptions): I18n {
    const tags = [options.default_locale, ...options.locales ?? [], ...Object.keys(options.messages ?? {})];
    for(const locale of tags) {
        if(!isWellFormedLocale(locale)) throw new RangeError(`Malformed locale "${locale}".`);
    }
    const cache = createIntlCache();
    const catalog_dir = options.catalog_dir ?? "i18n";
    let logger: Logger | null = null;
    // FormatJS reports a failing translation, then its failing source; `translate` allows one
    // report per call, and saves the count as a logger may call `t` while reporting.
    let reports_left = Number.POSITIVE_INFINITY;

    function createShape(locale: Locale, messages: Catalog): IntlShape {
        return createIntl({
            locale,
            defaultLocale: options.default_locale,
            messages,
            onError(error) {
                if(error.code === IntlErrorCode.MISSING_TRANSLATION || reports_left === 0) return;
                reports_left--;
                try {
                    (logger ?? console).error(error);
                } catch{
                    // Reporting never replaces the fallback output.
                }
            },
        }, cache);
    }

    /** One shape per catalog by `localeKey`, merging catalogs whose tags differ only in case. */
    function createShapes(catalogs: readonly (readonly [Locale, Catalog])[]): Map<string, IntlShape> {
        const merged = new Map<string, LocaleCatalog>();
        for(const [locale, messages] of catalogs) {
            const key = localeKey(locale);
            merged.set(key, {locale, messages: {...merged.get(key)?.messages, ...messages}});
        }
        return new Map([...merged].map(([key, {locale, messages}]) => [key, createShape(locale, messages)]));
    }

    const seed = Object.entries(options.messages ?? {})
        .flatMap(([locale, messages]) => messages == null ? [] : [[locale, messages] as const]);
    let shapes = createShapes(seed);
    // FormatJS formats a missing translation's source in the default locale, so one shape
    // without messages serves every tag without a catalog, malformed ones included.
    const source_shape = createShape(options.default_locale, {});

    function translate(locale: Locale, message: MessageDescriptor, values?: Record<string, PrimitiveValue>): string {
        // FormatJS requires an id.
        const keyed = message.id == null ? {...message, id: catalogKey(message)} : message;
        const shape = shapes.get(localeKey(locale)) ?? source_shape;
        const outer_reports_left = reports_left;
        reports_left = 1;
        try {
            return shape.formatMessage(keyed, values);
        } finally {
            reports_left = outer_reports_left;
        }
    }

    return {
        async load(read: CatalogReader, log?: Logger): Promise<void> {
            const loaded: [Locale, Catalog][] = [];
            for(const locale of options.locales ?? [options.default_locale]) {
                const subpath = `${catalog_dir}/${locale}.json`;
                const catalog = await read(subpath);
                if(catalog != null) loaded.push([locale, assertCatalog(subpath, catalog)]);
            }
            logger = log ?? null;
            shapes = createShapes([...seed, ...loaded]);
        },
        t(locale, message, ...[values]) {
            return translate(locale, message, values as Record<string, PrimitiveValue> | undefined);
        },
        bind<L extends Locale>(locale: L): BoundI18n<L> {
            return {
                locale,
                t(message, ...[values]) {
                    return translate(locale, message, values as Record<string, PrimitiveValue> | undefined);
                },
            };
        },
    };
}

/**
 * Declares typed source messages. An identity function that preserves literal types so the
 * values argument of {@link I18n.t} is inferred, and a name that `@formatjs/cli` recognizes for
 * extraction.
 *
 * @typeParam T - Map of key to source message
 * @param messages - Map of key to source message
 * @returns The same map, with literal types preserved
 * @category i18n
 */
export function defineMessages<const T extends Record<string, MessageDescriptor>>(messages: T): T {
    return messages;
}
