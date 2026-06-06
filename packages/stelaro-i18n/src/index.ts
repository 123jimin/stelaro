import {createIntl, createIntlCache, IntlErrorCode, type IntlShape} from "@formatjs/intl";
import type {DataAccess, Logger} from "@jiminp/stelaro";
import type {OptionalIfVoid} from "@jiminp/tooltool";

/** A BCP-47 language tag, e.g. `"en"`, `"ko"`, `"en-US"`.
 *
 * @category i18n
 */
export type Locale = string;

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
 * Options for a component-scoped translator.
 *
 * @category i18n
 */
export type I18nOptions = {
    /** Source / fallback locale */
    readonly default_locale: Locale;
    /** Locales whose catalogs `load` should read (default: just `default_locale`) */
    readonly locales?: readonly Locale[];
    /** Catalog subpath under the component data directory (default: `"i18n"`) */
    readonly catalog_dir?: string;
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
     * Loads this component's catalogs. Call once, from the component's `start` hook. The optional
     * `log` routes non-fallback translation errors through the component's logger instead of the
     * console.
     */
    load(data: DataAccess, log?: Logger): Promise<void>;
    /**
     * Translates `message` for an explicit `locale`. Synchronous; falls back to the message's
     * source (`defaultMessage`) when a translation is missing or before {@link I18n.load}.
     */
    t<const D extends MessageDescriptor>(
        locale: Locale,
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
    ): string;
};

type Catalog = Record<string, string>;

async function readCatalog(data: DataAccess, subpath: string): Promise<Catalog | null> {
    const raw: unknown = await data.read(subpath).optional().json();
    return raw as Catalog | null;
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
        async load(data: DataAccess, log?: Logger): Promise<void> {
            logger = log ?? null;
            const locales = options.locales ?? [options.default_locale];
            for(const locale of locales) {
                const catalog = await readCatalog(data, `${catalog_dir}/${locale}.json`);
                if(catalog != null) messages_by_locale.set(locale, catalog);
            }
            shapes.clear(); // rebuild lazily with the loaded catalogs (and the supplied logger)
        },
        t(locale, message, ...[values]) {
            return translate(locale, message, values as Record<string, PrimitiveValue> | undefined);
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
