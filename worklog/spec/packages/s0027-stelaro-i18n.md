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
`DataAccess` is from s0021. `ParamsOf<S>` infers interpolation parameters from an ICU source
string.

```typescript
type Locale = string;

type MessageDescriptor = {
    readonly id: string;             // stable message key
    // ICU source text and the final fallback. Intentionally camelCase, not snake_case, to mirror
    // FormatJS's own descriptor field so extraction is 1:1.
    readonly defaultMessage: string;
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
        ...values: ParamsOf<D["defaultMessage"]>   // [] when the source has no placeholders
    ): string;
};

// Synchronous holder constructor — safe to call inside a (synchronous) state factory.
function createI18n(options: I18nOptions): I18n;

// Declares typed source messages; preserves literals for ParamsOf inference and extraction.
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

- `t` resolves a message for the explicit `locale` argument. There is no ambient or active locale,
  so concurrent calls for different locales are independent.
- Fallback: requested locale → `default_locale` → the descriptor's `defaultMessage` (source). A
  missing translation — or a `t` call made before `load` — yields readable source text, never a
  blank or the bare id.
- Messages use ICU MessageFormat (interpolation, plurals, select), formatted with
  `intl-messageformat`; plurals/number/date use the platform `Intl` (no CLDR bundle).
- `t` is typed from the descriptor argument (declared via `defineMessages`), not from a core
  context generic. `ParamsOf` infers simple `{placeholder}` parameters; complex ICU (plural /
  select) may degrade to a loose value record.

### Catalogs + pipeline

- Catalogs are per-component JSON loaded via `DataAccess` from the component's data directory
  (default `{component data}/i18n/{locale}.json`). An absent catalog file is treated as empty.
- Source messages are declared in code (`defineMessages`) — typed and extractable; translations
  are JSON files. A dev-time `extract → translate → (pre)compile` pipeline uses `@formatjs/cli`
  to extract `{id, defaultMessage}` descriptors directly from TypeScript source (no Babel/SWC in
  the tsc build); ids are explicit.

## Constraints

- Core must not depend on this package, and this package must not require any change to the core
  `ComponentContext` — translation is reached through component state, never `context.t` (d0004).
- No ambient/active locale: the explicit locale argument selects the formatter.
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
