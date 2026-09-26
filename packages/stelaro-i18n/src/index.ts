import {createIntl, createIntlCache, IntlErrorCode, type IntlShape} from "@formatjs/intl";
import type {OptionalIfVoid} from "@jiminp/tooltool";

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
    /** Locales `load` requests from the reader (default: `[default_locale]`) */
    readonly locales?: readonly Locale[];
    /** Subpath prefix passed to the reader (default: `"i18n"`) */
    readonly catalog_dir?: string;
    /** In-memory catalogs by locale, usable by `t`/`bind` without {@link I18n.load}; independent of `locales` */
    readonly messages?: Readonly<Partial<Record<Locale, Catalog>>>;
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
     * Translates `message` for an explicit `locale`. Synchronous; falls back to the message's
     * source (`defaultMessage`) when a translation is missing or before {@link I18n.load}. A malformed
     * or runtime-unsupported `locale` is reported and gets the source formatted in `default_locale`.
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

// Malformed tags make `Intl` throw; well-formed tags without runtime locale data match nothing.
function isSupportedLocale(locale: Locale): boolean {
    try {
        return Intl.NumberFormat.supportedLocalesOf(locale).length > 0
            && Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0;
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

/**
 * Creates a component-scoped {@link I18n} backed by FormatJS. Synchronous and safe to call inside
 * a component state factory; catalogs are read later by {@link I18n.load}.
 *
 * @param options - Default locale, loadable locales, catalog directory, and seeded catalogs
 * @returns A new {@link I18n} holder
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
 * @category i18n
 */
export function createI18n(options: I18nOptions): I18n {
    const cache = createIntlCache();
    const catalog_dir = options.catalog_dir ?? "i18n";
    const messages_by_locale = new Map<Locale, Catalog>();
    if(options.messages != null) {
        for(const [locale, catalog] of Object.entries(options.messages)) {
            if(catalog != null) messages_by_locale.set(locale, catalog);
        }
    }
    const shapes = new Map<Locale, IntlShape>();
    let logger: Logger | null = null;

    function shapeFor(locale: Locale): IntlShape {
        const cached = shapes.get(locale);
        if(cached != null) return cached;
        const supported = isSupportedLocale(locale);
        if(!supported) {
            (logger ?? console).error(
                `Unsupported locale "${locale}"; using source text formatted in "${options.default_locale}".`,
            );
        }
        const shape = createIntl({
            locale: supported ? locale : options.default_locale,
            defaultLocale: options.default_locale,
            messages: supported ? messages_by_locale.get(locale) ?? {} : {},
            onError(error) {
                if(error.code === IntlErrorCode.MISSING_TRANSLATION) return;
                (logger ?? console).error(error);
            },
        }, cache);
        shapes.set(locale, shape);
        return shape;
    }

    function translate(locale: Locale, message: MessageDescriptor, values?: Record<string, PrimitiveValue>): string {
        // FormatJS requires an id.
        const keyed = message.id == null ? {...message, id: catalogKey(message)} : message;
        return shapeFor(locale).formatMessage(keyed, values);
    }

    return {
        async load(read: CatalogReader, log?: Logger): Promise<void> {
            logger = log ?? null;
            const locales = options.locales ?? [options.default_locale];
            for(const locale of locales) {
                const catalog = await readCatalog(read, `${catalog_dir}/${locale}.json`);
                if(catalog != null) {
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
 * @typeParam T - Map of key to source message
 * @param messages - Map of key to source message
 * @returns The same map, with literal types preserved
 * @category i18n
 */
export function defineMessages<const T extends Record<string, MessageDescriptor>>(messages: T): T {
    return messages;
}
