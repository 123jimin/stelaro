+++
id = "s0027"
title = "Stelaro i18n"
tags = ["i18n", "localization", "formatjs"]
paths = ["packages/stelaro-i18n/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0027. External catalog
extraction and translation workflow is owned by s0030; runtime catalogs remain
string-valued.

## Types

Types are shown at their widest readable form. `Locale` is a BCP-47 tag.
`MessageValues<S>` infers simple ICU placeholders and becomes a loose record
for plural/select syntax; `OptionalIfVoid` omits the values argument only when
the message has none.

```typescript
type Locale = string;
type MessageDescriptor = {
    readonly id?: string;
    readonly defaultMessage: string;
    readonly description?: string;
};
type Catalog = Record<string, string>;
type CatalogReader = (subpath: string) => Promise<unknown>;
type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};
type I18nOptions = {
    readonly default_locale: Locale;
    readonly locales?: readonly Locale[];
    readonly catalog_dir?: string;
    readonly messages?: Readonly<Partial<Record<Locale, Catalog>>>;
};
type I18n = {
    load(read: CatalogReader, log?: Logger): Promise<void>;
    t<const D extends MessageDescriptor>(
        locale: Locale,
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
    ): string;
    bind(locale: Locale): BoundI18n;
};
type BoundI18n = {
    t<const D extends MessageDescriptor>(
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
    ): string;
};
function createI18n(options: I18nOptions): I18n;
function defineMessages<const T extends Record<string, MessageDescriptor>>(messages: T): T;
```

## Behavior

### Construction and loading

- `createI18n` synchronously creates a holder suitable for a component state
  factory. `messages` seeds per-locale string catalogs immediately without I/O.
- `load` reads `{catalog_dir}/{locale}.json` for each configured locale through
  a caller-supplied `CatalogReader`; defaults are `i18n` and
  `[default_locale]`. A null or absent result is an empty catalog.
- The package reads no files. A component may adapt s0021 data access; a browser
  may provide `fetch`. The optional structural logger may be `context.log`.
- Loaded ids overlay an existing seed for that locale; loaded ids win and
  seed-only ids survive. `locales` restricts only `load`, not seeded locales.

### Translation

- Each populated locale has one `@formatjs/intl` `IntlShape`. `t` selects it
  from the explicit locale; no ambient locale exists, so concurrent locales are
  independent.
- A descriptor key is explicit `id`, otherwise `defaultMessage`.
  `description` is translator context and never part of the key.
- Fallback is translated message, then `defaultMessage`, then the literal key.
  Missing translation or use before loading returns readable source text.
- Messages use ICU MessageFormat; number, date, plural, and select behavior uses
  platform `Intl` without a CLDR bundle.
- Malformed ICU and missing interpolation values are reported through the
  logger supplied to `load`. Without one, errors use `console.error`. Missing
  translation is expected fallback and is not logged. Reporting never throws
  or replaces fallback output.
- `t` infers values from `defaultMessage`. Simple placeholders are strict;
  plural/select syntax uses loose values. The values argument is required only
  when interpolation needs it.
- `bind(locale).t(message, ...values)` is equivalent in behavior and typing to
  `t(locale, message, ...values)` and captures no global state.

### Component wiring

- A component holds the synchronous `I18n` in its state, calls `load` from its
  start hook, and calls `t` or `bind` from handlers. The holder is non-null and
  catalog loading is the only I/O.

## Constraints

- Localization is an optional companion package, never core context. Core MUST
  NOT depend on it, and translation MUST remain in component state rather than
  `context.t`.
- The package MUST NOT import or depend on `@jiminp/stelaro`; reader and logger
  contracts remain structural and gateway-agnostic.
- Browser use is first-class. Runtime dependencies MUST remain client-safe and
  as small as the ICU requirement permits.
- Runtime `Catalog` values are strings. AST catalogs are outside the current
  contract and are tracked by s0030.

## Anticipated Changes

- Component wiring helpers, locale negotiation, bounded formatter caching, and
  a smaller or parser-free ICU runtime may be considered.

## Dangers

- Calling `t` before `load` intentionally returns source and may conceal a
  forgotten load.
- Full plural/select value typing is not promised.
- `createIntl` pulls unused formatter features into client bundles; replacing
  it may reduce bundle size but must preserve current fallback semantics.
