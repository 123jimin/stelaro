+++
id = "s0026"
title = "Localization"
tags = ["i18n", "localization", "context", "application", "component"]
paths = ["packages/stelaro/src/i18n/**"]
+++

## Related Specs

- s0001: High-Level Architecture (localization as a cross-cutting concern)
- s0002: Application (translator factory injection)
- s0004: Context (`context.t`)
- s0021: Data Access (catalog files)
- s0027: Stelaro i18n (FormatJS backend)

## Types

Types are shown erased to their widest form for readability. `ComponentId` and `DataAccess` are
the core types from s0003 / s0021.

```typescript
type Locale = string; // BCP-47 language tag, e.g. "en", "ko", "en-US"

type MessageDescriptor = {
    readonly id: string;             // stable message key, unique within the component
    readonly defaultMessage: string; // ICU MessageFormat source text — the final fallback
};

// Resolves one message for an explicit locale. Synchronous.
type Translator = (
    locale: Locale,
    message: MessageDescriptor,
    values?: Record<string, unknown>,
) => string;

// Builds a component-scoped Translator. Receives the component's DataAccess so a backend can
// load catalogs; may be asynchronous (catalogs are files).
type TranslatorFactory = (component_id: ComponentId, data: DataAccess) => Promisable<Translator>;
```

`ComponentContext` (s0004) gains `readonly t: Translator`.

## Behavior

- Translation is component-scoped: each component has its own message namespace keyed by its id,
  the same way logging and configuration are component-scoped.
- **Locale is explicit.** `t` takes the target locale as its first argument; the locale comes
  from call input. There is no ambient or active locale — components have no request context
  (s0002 / s0004), so concurrent calls for different locales are fully independent.
- Messages use ICU MessageFormat: interpolation, plurals, and select.
- **Fallback chain:** requested locale → default locale → the descriptor's `defaultMessage`
  (source). A missing or partial translation always yields readable source text — never blank,
  never the bare id.
- **Catalogs are per-component and opt-in by presence.** A component's translations live under
  its data directory (s0021); a component with no catalog files uses source text for every
  locale. No declaration on the component is required (consistent with Data Access).
- **The backend is injectable.** An application definition may provide a `TranslatorFactory`
  (like `logger` / `LoggerFactory`); with none, core uses a default source translator that
  returns each message's `defaultMessage` with interpolation, ignoring locale and catalogs.
- Component translators are built during application start (catalog loading is I/O); the factory
  may be asynchronous, and `context.t` is synchronous once built.

## Constraints

- Core stays backend-agnostic: the core contract carries no ICU runtime and no catalog format;
  the ICU/format implementation lives in a backend package (s0027). Core must not depend on it.
- The default source translator must not read catalog files or perform I/O.
- A translator must never throw on a missing translation or unknown locale; it falls back to
  source.
- Locale must be an explicit argument; core context must not expose or depend on an ambient
  locale.

## Anticipated Changes

- Locale negotiation helpers (Accept-Language parsing, best-match) may be added in gateway
  packages or application code, never in the core contract.
- Locale-aware Data Access resolution (s0021's anticipated `data/{locale}/`) may be adopted for
  catalog layout.

## Dangers

- An ambient/active locale would reintroduce shared mutable state and make concurrent
  multi-locale translation racy — the explicit-locale argument exists to prevent this.
- A fallback that yields blanks or bare ids would surface untranslated UI as broken text.
- Coupling the core contract to a specific catalog format or ICU runtime would block swapping
  backends.
