+++
id = "s0027"
title = "Stelaro i18n"
tags = ["i18n", "localization", "formatjs"]
paths = ["packages/stelaro-i18n/**"]
+++

## Related Specs

- s0003: Component (components wire i18n through their own state)
- s0021: Data Access (a component adapts its `DataAccess` into the reader `load` takes)
- s0025: Pino Logger (companion-package precedent)
- d0004: i18n lives in a package, not the core context
- d0005: loading goes through a caller-supplied reader, not `DataAccess` (no server-framework dep)

## Overview

Localization is not a core concern: the core `ComponentContext` has no translation capability
(d0004). `@jiminp/stelaro-i18n` is an optional companion package. A component that needs
translation wires an `I18n` holder into its own component state (s0003): it constructs the holder
in its (synchronous) state factory, loads catalogs in its `start` hook through a `DataAccess`-backed
reader (s0021), and calls it from handlers. Core is untouched. Outside a component — a browser, or any gateway
without a filesystem — the same holder is instead seeded with in-memory catalogs at construction (no
`DataAccess`), so one runtime serves both server and client.

## Types

Types are shown erased to their widest form for readability. `Locale` is a BCP-47 tag.
`CatalogReader` is a caller-supplied async catalog source and `Logger` a minimal structural logger
(any object with leveled methods — a component's `context.log` satisfies it); neither is imported
from the server framework, so the package carries no `@jiminp/stelaro` dependency (d0005).
`MessageValues<S>` is the values an ICU source `S` interpolates, and `OptionalIfVoid` (from
`@jiminp/tooltool`) makes the values argument optional when there are none.

```typescript
type Locale = string;

type MessageDescriptor = {
    readonly id: string;              // stable message key
    // ICU source text and the final fallback. Intentionally camelCase, not snake_case, to mirror
    // FormatJS's own descriptor fields so extraction is 1:1.
    readonly defaultMessage: string;
    readonly description?: string;    // translator context; carried through extraction
};

// A locale's runtime catalog: message id → translated string.
type Catalog = Record<string, string>;

// A caller-supplied async catalog source — reads a subpath, resolving to parsed JSON (null/absent
// ⇒ empty catalog). A component adapts its DataAccess; a browser uses fetch. No server-framework dep.
type CatalogReader = (subpath: string) => Promise<unknown>;

// A minimal structural logger; a component's `context.log` satisfies it.
type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

type I18nOptions = {
    readonly default_locale: Locale;        // source / fallback locale
    readonly locales?: readonly Locale[];    // locales `load` reads from files (default: default_locale)
    readonly catalog_dir?: string;           // subpath under the component data dir; default "i18n"
    // In-memory catalogs seeded at construction — a gateway-agnostic alternative to `load` (no
    // DataAccess), for a consumer that already holds the catalog (e.g. a browser). A seeded locale
    // is usable immediately; independent of `locales`.
    readonly messages?: Readonly<Partial<Record<Locale, Catalog>>>;
};

type I18n = {
    // Loads catalogs via a caller-supplied reader (a component adapts its DataAccess). Call once,
    // e.g. from a component's start hook. Optional `log` routes non-fallback errors (see Translation).
    load(read: CatalogReader, log?: Logger): Promise<void>;
    // Translates for an explicit locale. Synchronous; usable directly in handlers.
    t<const D extends MessageDescriptor>(
        locale: Locale,
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>   // no values arg when S has none
    ): string;
    // A translator with the locale fixed: bind(locale).t(message, …) === t(locale, message, …).
    bind(locale: Locale): BoundI18n;
};

type BoundI18n = {
    // Translates for the locale captured by `bind`. Same fallback chain and typing as `t`.
    t<const D extends MessageDescriptor>(
        message: D,
        ...values: OptionalIfVoid<MessageValues<D["defaultMessage"]>>
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
  - `start(ctx)` calls `await ctx.state.i18n.load(p => ctx.data.read(p).optional().json(), ctx.log)`
    — the one asynchronous step; the component adapts its `DataAccess` (s0021) to the reader.
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
- Non-fallback formatting errors — malformed ICU source, a missing interpolation value — are
  reported through the `Logger` supplied to `load`, never directly to the console. A missing
  translation is a by-design fallback (above), not an error, and is never reported. When no logger
  was supplied — `load` was not called with one, or `t` runs before `load` — reporting degrades to
  `console.error`; this is the only console path. Reporting never throws and never blanks the
  result: `t` still returns the FormatJS fallback text.
- `t` is typed from the descriptor argument (declared via `defineMessages`), not from a core
  context generic. `MessageValues<S>` types simple `{placeholder}` keys and degrades to a loose
  record under ICU control syntax (plural / select); `OptionalIfVoid` makes the values argument
  required iff `S` interpolates.
- `bind(locale)` returns a translator with the locale fixed: `bind(locale).t(message, ...values)`
  is exactly `t(locale, message, ...values)` — same fallback chain and same typing. The locale is
  captured per `bind` call (still no ambient locale); a per-request or per-user-locale caller binds
  once instead of repeating the locale on every call.

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
- `I18n.load` reads each locale's runtime catalog (strings or AST) through the supplied
  `CatalogReader` at `{catalog_dir}/{locale}.json` (default dir `i18n`); a reader resolving to
  null/absent yields an empty catalog (that locale falls back to source). The package reads no files
  itself — a component supplies a `DataAccess`-backed reader (s0021), a browser a `fetch`-backed one.
- Catalogs are populated by either path, both writing the same per-locale runtime catalogs:
  **`load`** reads them through its `CatalogReader` (the server/component path above backs it with
  `DataAccess`), and the **`messages`** option seeds them in memory at construction (gateway-agnostic
  — a browser or any client that already holds the catalog, with no `DataAccess`). A seeded locale is
  usable by `t` and `bind` immediately, with no `load`.
- When both populate the same locale, `load` overlays the seed at the id level: `load`'s ids win and
  seeded-only ids survive.
- `locales` gates only what `load` reads from files; seeding via `messages` is independent — a
  seeded locale formats even if it is not listed in `locales`.
- Extraction reads the `defineMessages` declarations (descriptor objects), **not** the locale-first
  `t(locale, message, …)` calls — `@formatjs/cli`'s `--additional-function-names` assumes a
  `formatMessage(descriptor, …)` shape (descriptor first), which `t` is not. Ids are explicit, so
  no Babel/SWC transform is needed. It is a developer-run, offline step requiring no package
  tooling: stock `@formatjs/cli` recognizes the `defineMessages` name and the FormatJS-shaped
  descriptors as-is (e.g. `formatjs extract 'src/**/*.ts'`).

## Constraints

- Core must not depend on this package, and this package must not require any change to the core
  `ComponentContext` — translation is reached through component state, never `context.t` (d0004).
- No ambient/active locale: the explicit locale argument selects the per-locale `IntlShape`.
- The package is gateway-agnostic (d0005): it imports nothing from the server framework (no
  `@jiminp/stelaro` dependency) and reads no files itself. `load` takes a caller-supplied async
  `CatalogReader`; a component adapts its `DataAccess` (s0021), a browser uses `fetch`. In-memory
  seeding via `messages` needs no reader at all.
- **This package is bundled into client code (the browser is a first-class runtime, not just the
  server).** Client bundle size and client-safety are therefore primary constraints, not
  afterthoughts: no server-framework dependency (d0005, above), and the runtime dependency surface
  is kept as small as the ICU requirement allows (see Dangers / Anticipated Changes on the FormatJS
  footprint).
- `createI18n` is synchronous (state-factory-safe); all I/O happens in `load` (seeding is in-memory,
  no I/O).

## Anticipated Changes

- A `withI18n(options, definition)` helper may wrap the state + start wiring so a component need
  not write it by hand (still surfaced through component state).
- Precompiled catalogs (`@formatjs/cli compile`) for faster runtime parsing.
- Locale negotiation / best-match helpers.
- A bounded cache for per-`(component, locale)` formatters if locale counts grow.
- Shrinking the client bundle (the FormatJS footprint), in increasing payoff: bypass `createIntl`
  (use `@formatjs/intl`'s lower-level `formatMessage`, or the ICU engine directly) so the unused
  date/number/list/relative-time/display-name formatters tree-shake; and — once AST catalogs land —
  a parser-free ICU build (no string-parser shipped), the largest single saving. Each trades code or
  a pipeline step for a smaller footprint; weigh against the fallback-semantics already provided.

## Dangers

- Full ICU parameter typing (plural / select) is hard at the type level; over-promising typed
  values would mislead — infer simple placeholders and degrade complex messages to loose values.
- Calling `t` before `load` silently returns source; intended, but a component that forgets `load`
  would never show translations.
- Translator tools treat catalog ICU syntax as opaque; malformed plural/select is caught only if
  the pipeline validates it.
- Since the package ships in client bundles, dependency weight is a danger, not just a server-side
  detail. Building a translator via the FormatJS `IntlShape` (`createIntl`) binds every FormatJS
  formatter (date / number / list / relative-time / display-name / plural), none of which this
  package uses — so a bundler cannot tree-shake them and the whole `@formatjs/intl` wrapper ships
  even though only the ICU message engine is needed.
