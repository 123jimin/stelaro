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
    /** Source / fallback locale; must be a well-formed tag the runtime supports */
    readonly default_locale: Locale;
    /**
     * Locales `load` requests from the reader (default: `[default_locale]`); a malformed one's
     * catalog is ignored
     */
    readonly locales?: Nullable<readonly Locale[]>;
    /** Subpath prefix passed to the reader (default: `"i18n"`) */
    readonly catalog_dir?: Nullable<string>;
    /**
     * In-memory catalogs by locale, usable by `t`/`bind` without {@link I18n.load}; independent of
     * `locales`. Locales match case-insensitively; a malformed one's catalog is ignored.
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
     * Loads catalogs via a caller-supplied `read` (a component adapts its `DataAccess`, a browser
     * uses `fetch`). The optional `log` receives non-fallback translation errors instead of the console.
     */
    load(read: CatalogReader, log?: Logger): Promise<void>;
    /**
     * Translates `message` for an explicit `locale`, matched case-insensitively against catalog
     * locales. Synchronous; falls back to the message's source (`defaultMessage`), formatted in
     * `default_locale`, when a translation is missing or before {@link I18n.load}. A malformed
     * `locale` tag is reported and gets that fallback.
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

// Tags `t` received without a catalog. Remembering them skips the well-formedness check, which
// costs about as much as a translation; the bound keeps client-supplied tags from growing memory.
const MAX_FALLBACK_TAGS = 256;

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
 * @throws {RangeError} When `default_locale` is not a well-formed locale tag
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
    if(!isWellFormedLocale(options.default_locale)) {
        throw new RangeError(`Malformed default_locale "${options.default_locale}".`);
    }
    const cache = createIntlCache();
    const catalog_dir = options.catalog_dir ?? "i18n";
    // BCP 47 tags are case-insensitive, so catalogs and shapes are keyed by `localeKey`.
    // A catalog under a malformed tag is unreachable: a malformed request tag gets no catalog.
    const addCatalog = (target: Map<string, LocaleCatalog>, locale: Locale, messages: Catalog): void => {
        if(!isWellFormedLocale(locale)) return;
        const key = localeKey(locale);
        target.set(key, {locale, messages: {...target.get(key)?.messages, ...messages}});
    };
    const seed = new Map<string, LocaleCatalog>();
    for(const [locale, messages] of Object.entries(options.messages ?? {})) {
        if(messages != null) addCatalog(seed, locale, messages);
    }
    let catalogs: ReadonlyMap<string, LocaleCatalog> = seed;
    // One shape per catalog, rebuilt after each load; `source_shape` serves every other tag.
    const shapes = new Map<string, IntlShape>();
    let source_shape: IntlShape | null = null;
    const fallback_tags = new Set<string>();
    let logger: Logger | null = null;

    function createShape(locale: Locale, messages: Catalog): IntlShape {
        return createIntl({
            locale,
            defaultLocale: options.default_locale,
            messages,
            onError(error) {
                if(error.code === IntlErrorCode.MISSING_TRANSLATION) return;
                (logger ?? console).error(error);
            },
        }, cache);
    }

    function shapeFor(locale: Locale): IntlShape {
        const key = localeKey(locale);
        const cached = shapes.get(key);
        if(cached != null) return cached;
        const catalog = catalogs.get(key);
        if(catalog != null) {
            const shape = createShape(catalog.locale, catalog.messages);
            shapes.set(key, shape);
            return shape;
        }

        if(!fallback_tags.has(key)) {
            if(fallback_tags.size >= MAX_FALLBACK_TAGS) fallback_tags.clear();
            fallback_tags.add(key);
            if(!isWellFormedLocale(locale)) {
                (logger ?? console).error(
                    `Malformed locale "${locale}"; using source text formatted in "${options.default_locale}".`,
                );
            }
        }
        // FormatJS formats a missing translation's source in the default locale, so one shape
        // without messages serves every tag without a catalog.
        return source_shape ??= createShape(options.default_locale, {});
    }

    function translate(locale: Locale, message: MessageDescriptor, values?: Record<string, PrimitiveValue>): string {
        // FormatJS requires an id.
        const keyed = message.id == null ? {...message, id: catalogKey(message)} : message;
        return shapeFor(locale).formatMessage(keyed, values);
    }

    return {
        async load(read: CatalogReader, log?: Logger): Promise<void> {
            const next = new Map(seed);
            for(const locale of options.locales ?? [options.default_locale]) {
                const catalog = await read(`${catalog_dir}/${locale}.json`) as Catalog | null | undefined;
                if(catalog != null) addCatalog(next, locale, catalog);
            }
            catalogs = next;
            logger = log ?? null;
            shapes.clear();
            fallback_tags.clear();
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
