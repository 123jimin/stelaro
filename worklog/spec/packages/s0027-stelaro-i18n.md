+++
id = "s0027"
title = "Stelaro i18n"
tags = ["i18n", "localization", "formatjs"]
paths = ["packages/stelaro-i18n/**"]
+++

## Related Specs

- s0003: Component (components wire i18n through their own state)
- s0021: Data Access (catalog loading)
- s0025: Pino Logger (companion-package precedent)
- d0004: i18n lives in a package, not the core context

## Overview

Localization is not a core concern: the core `ComponentContext` has no translation capability
(d0004). `@jiminp/stelaro-i18n` is an optional companion package. A component that needs
translation wires an `I18n` holder into its own component state (s0003): it constructs the holder
in its (synchronous) state factory, loads catalogs in its `start` hook via `DataAccess` (s0021),
and calls it from handlers. Core is untouched.

## Types

Types are shown erased to their widest form for readability. `Locale` is a BCP-47 tag;
`DataAccess` is from s0021. `MessageValues<S>` is the values an ICU source `S` interpolates, and
`OptionalIfVoid` (from `@jiminp/tooltool`) makes the values argument optional when there are none.

```typescript
type Locale = string;

type MessageDescriptor = {
    readonly id: string;              // stable message key
    // ICU source text and the final fallback. Intentionally camelCase, not snake_case, to mirror
    // FormatJS's own descriptor fields so extraction is 1:1.
    readonly defaultMessage: string;
    readonly description?: string;    // translator context; carried through extraction
};

type I18nOptions = {
    readonly default_locale: Locale;        // source / fallback locale
    readonly locales?: readonly Locale[];    // optional allow-list of loadable locales
    readonly catalog_dir?: string;           // subpath under the component data dir; default "i18n"
};

type I18n = {
    // Loads this component's catalogs. Call once, from the component's start hook.
    load(data: DataAccess): Promise<void>;
    // Translates for an explicit locale. Synchronous; usable directly in handlers.
    t<const D extends MessageDescriptor>(
        locale: Locale,
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>   // no values arg when S has none
    ): string;
};

// Synchronous holder constructor — safe to call inside a (synchronous) state factory.
function createI18n(options: I18nOptions): I18n;

// Declares typed source messages; preserves literals for MessageValues inference and extraction.
function defineMessages<const T extends Record<string, MessageDescriptor>>(messages: T): T;
```

## Behavior

### Wiring (component-owned; no core change)

- A component opts into translation by holding an `I18n` in its state:
  - `state: () => ({ i18n: createI18n(options) })` — synchronous; the holder always exists, so the
    state field is non-null (no `state.i18n!`).
  - `start(ctx)` calls `await ctx.state.i18n.load(ctx.data)` — the one asynchronous step.
  - handlers call `ctx.state.i18n.t(locale, message, ...values)` synchronously.
- Created sync, loaded async, used sync. Catalog loading is the only I/O and happens in `start`,
  before any handler runs.

### Translation

- Each locale is backed by an `@formatjs/intl` `IntlShape`, built once via
  `createIntl({locale, defaultLocale: default_locale, messages})` (one shape per locale).
  `t(locale, message, ...values)` selects the shape for the explicit `locale` and delegates to
  `intl.formatMessage(message, values)`. There is no ambient or active locale, so concurrent calls
  for different locales are independent.
- Fallback is FormatJS's `formatMessage` chain: translated message at the id → the descriptor's
  `defaultMessage` → … → the literal id. So a missing translation — or a `t` call made before
  `load` (no shapes yet) — yields readable source text, never a blank.
- Messages use ICU MessageFormat (interpolation, plurals, select); plurals/number/date use the
  platform `Intl` (no CLDR bundle).
- `t` is typed from the descriptor argument (declared via `defineMessages`), not from a core
  context generic. `MessageValues<S>` types simple `{placeholder}` keys and degrades to a loose
  record under ICU control syntax (plural / select); `OptionalIfVoid` makes the values argument
  required iff `S` interpolates.

### Catalogs + pipeline

- Three shapes flow through the pipeline (keys below are message *ids*, e.g. `"home.greeting"`,
  not a literal `id`):
  - **Source**, from `@formatjs/cli` extract of the in-code `defineMessages` declarations:
    `Record<MessageId, { defaultMessage: string; description?: string }>` — the default locale,
    handed to translators.
  - **Translations**, per locale: `Record<MessageId, string>` — id → translated string only; no
    `defaultMessage` / `description`.
  - **Runtime**: the per-locale `Record<MessageId, string>` is loaded as `createIntl`'s `messages`.
    `@formatjs/cli compile --ast` is an optional perf step that precompiles a catalog to
    `Record<MessageId, MessageFormatElement[]>` (an AST) to skip runtime parsing.
- `I18n.load` reads the per-locale runtime catalog (strings or AST) from the component's data
  directory via `DataAccess` (default `{component data}/i18n/{locale}.json`); an absent file is an
  empty catalog (that locale falls back to source).
- Extraction reads the `defineMessages` declarations (descriptor objects), **not** the locale-first
  `t(locale, message, …)` calls — `@formatjs/cli`'s `--additional-function-names` assumes a
  `formatMessage(descriptor, …)` shape (descriptor first), which `t` is not. Ids are explicit, so
  no Babel/SWC transform is needed.

## Constraints

- Core must not depend on this package, and this package must not require any change to the core
  `ComponentContext` — translation is reached through component state, never `context.t` (d0004).
- No ambient/active locale: the explicit locale argument selects the per-locale `IntlShape`.
- Catalog loading goes through `DataAccess` (s0021); the package does not read files directly.
- `createI18n` is synchronous (state-factory-safe); all I/O happens in `load`.

## Anticipated Changes

- A `withI18n(options, definition)` helper may wrap the state + start wiring so a component need
  not write it by hand (still surfaced through component state).
- Precompiled catalogs (`@formatjs/cli compile`) for faster runtime parsing.
- Locale negotiation / best-match helpers.
- A bounded cache for per-`(component, locale)` formatters if locale counts grow.

## Dangers

- Full ICU parameter typing (plural / select) is hard at the type level; over-promising typed
  values would mislead — infer simple placeholders and degrade complex messages to loose values.
- Calling `t` before `load` silently returns source; intended, but a component that forgets `load`
  would never show translations.
- Translator tools treat catalog ICU syntax as opaque; malformed plural/select is caught only if
  the pipeline validates it.
