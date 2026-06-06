import {createIntl, createIntlCache, IntlErrorCode, type IntlShape} from "@formatjs/intl";
import type {OptionalIfVoid} from "@jiminp/tooltool";

/** A BCP-47 language tag, e.g. `"en"`, `"ko"`, `"en-US"`.
 *
 * @category i18n
 */
export type Locale = string;

/**
 * A minimal structural logger. A component's `context.log` (`@jiminp/stelaro`) satisfies it, as does
 * `console`. The package defines its own so it carries no server-framework dependency (d0005).
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
 * The caller chooses the source: a component adapts its `DataAccess`, a browser uses `fetch`. This
 * is the seam that keeps the package gateway-agnostic — no server-framework dependency (d0005).
 *
 * @category i18n
 */
export type CatalogReader = (subpath: string) => Promise<unknown>;

/**
 * A source message: a stable id and its ICU MessageFormat source text.
 *
 * @category i18n
 */
export type MessageDescriptor = {
    /** Stable message key, unique within the component */
    readonly id: string;
    /**
     * ICU source text and the final fallback. Intentionally camelCase, not snake_case, to mirror
     * FormatJS's own descriptor fields so extraction is 1:1.
     */
    readonly defaultMessage: string;
    /** Optional translator context, carried through extraction */
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
    /** Source / fallback locale */
    readonly default_locale: Locale;
    /** Locales whose catalogs `load` reads from files (default: just `default_locale`) */
    readonly locales?: readonly Locale[];
    /** Catalog subpath under the component data directory (default: `"i18n"`) */
    readonly catalog_dir?: string;
    /**
     * In-memory catalogs seeded at construction — a gateway-agnostic alternative to {@link I18n.load}
     * for a consumer that already holds the catalog (e.g. a browser), with no `DataAccess`. A seeded
     * locale is usable by `t`/`bind` immediately, with no `load`. Independent of `locales`.
     */
    readonly messages?: Readonly<Partial<Record<Locale, Catalog>>>;
};

/** A value an ICU placeholder can interpolate. */
type PrimitiveValue = string | number | boolean | Date;

/**
 * The interpolation values an ICU source string `S` needs: a typed record of its simple
 * `{placeholder}` names, a loose record under ICU control syntax (plural / select), or `void`
 * when `S` has no placeholders. One traversal accumulates the names; a comma inside any `{...}`
 * means control syntax, which can't be refined precisely, so it degrades to a loose record.
 * Paired with tooltool's `OptionalIfVoid` so the values argument is required exactly when `S`
 * interpolates.
 */
type MessageValues<S extends string, Names extends string = never> =
    S extends `${string}{${infer Inner}}${infer Rest}`
        ? Inner extends `${string},${string}`
            ? Record<string, PrimitiveValue>
            : MessageValues<Rest, Names | Inner>
        : [Names] extends [never] ? void : {[K in Names]: PrimitiveValue};

/**
 * A component-scoped translator. Construct it synchronously with {@link createI18n}, load its
 * catalogs in the component's `start` hook, and call `t` from handlers.
 *
 * @category i18n
 */
export type I18n = {
    /**
     * Loads catalogs via a caller-supplied `read` (a component adapts its `DataAccess`, a browser
     * uses `fetch`). Call once. The optional `log` routes non-fallback translation errors through it
     * instead of the console.
     */
    load(read: CatalogReader, log?: Logger): Promise<void>;
    /**
     * Translates `message` for an explicit `locale`. Synchronous; falls back to the message's
     * source (`defaultMessage`) when a translation is missing or before {@link I18n.load}.
     */
    t<const D extends MessageDescriptor>(
        locale: Locale,
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
    ): string;
    /**
     * Returns a translator with `locale` fixed: `bind(locale).t(message, …)` is
     * `t(locale, message, …)`. Useful for a per-request or per-user-locale caller that should not
     * repeat the locale on every call.
     */
    bind(locale: Locale): BoundI18n;
};

/**
 * An {@link I18n} translator with the locale fixed by {@link I18n.bind}.
 *
 * @category i18n
 */
export type BoundI18n = {
    /**
     * Translates `message` for the bound locale. Same fallback chain and typing as {@link I18n.t}.
     */
    t<const D extends MessageDescriptor>(
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
    ): string;
};

async function readCatalog(read: CatalogReader, subpath: string): Promise<Catalog | null> {
    const raw: unknown = await read(subpath);
    return (raw as Catalog | null) ?? null;
}

/**
 * Creates a component-scoped {@link I18n} backed by FormatJS. Synchronous and safe to call inside
 * a component state factory; catalogs are read later by {@link I18n.load}.
 *
 * @param options - Default locale, loadable locales, and catalog directory
 * @returns A new {@link I18n} holder
 * @category i18n
 */
export function createI18n(options: I18nOptions): I18n {
    const cache = createIntlCache();
    const catalog_dir = options.catalog_dir ?? "i18n";
    const messages_by_locale = new Map<Locale, Catalog>();
    // Seed in-memory catalogs (gateway-agnostic; usable by `t`/`bind` before/without `load`).
    if(options.messages != null) {
        for(const [locale, catalog] of Object.entries(options.messages)) {
            if(catalog != null) messages_by_locale.set(locale, catalog);
        }
    }
    const shapes = new Map<Locale, IntlShape>();
    // Set by `load`; read lazily by `onError` at error-time. Null before `load` (or when `load`
    // ran without a logger), in which case reporting degrades to the console.
    let logger: Logger | null = null;

    function shapeFor(locale: Locale): IntlShape {
        const cached = shapes.get(locale);
        if(cached != null) return cached;
        const shape = createIntl({
            locale,
            defaultLocale: options.default_locale,
            messages: messages_by_locale.get(locale) ?? {},
            onError(error) {
                // A missing translation falls back to source by design; only surface real errors,
                // through the component logger when one is set, else the console as a last resort.
                if(error.code === IntlErrorCode.MISSING_TRANSLATION) return;
                (logger ?? console).error(error);
            },
        }, cache);
        shapes.set(locale, shape);
        return shape;
    }

    function translate(locale: Locale, message: MessageDescriptor, values?: Record<string, PrimitiveValue>): string {
        return shapeFor(locale).formatMessage(message, values);
    }

    return {
        async load(read: CatalogReader, log?: Logger): Promise<void> {
            logger = log ?? null;
            const locales = options.locales ?? [options.default_locale];
            for(const locale of locales) {
                const catalog = await readCatalog(read, `${catalog_dir}/${locale}.json`);
                if(catalog != null) {
                    // `load` overlays the seed at the id level: loaded ids win, seeded-only survive.
                    const seeded = messages_by_locale.get(locale);
                    messages_by_locale.set(locale, seeded != null ? {...seeded, ...catalog} : catalog);
                }
            }
            shapes.clear(); // rebuild lazily with the loaded catalogs (and the supplied logger)
        },
        t(locale, message, ...[values]) {
            return translate(locale, message, values as Record<string, PrimitiveValue> | undefined);
        },
        bind(locale: Locale): BoundI18n {
            return {
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
 * @param messages - Map of key to {@link MessageDescriptor}
 * @returns The same map, with literal types preserved
 * @category i18n
 */
export function defineMessages<const T extends Record<string, MessageDescriptor>>(messages: T): T {
    return messages;
}
