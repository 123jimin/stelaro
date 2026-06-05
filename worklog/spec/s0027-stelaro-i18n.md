+++
id = "s0027"
title = "Stelaro i18n"
tags = ["i18n", "localization", "formatjs"]
paths = ["packages/stelaro-i18n/**"]
+++

## Related Specs

- s0026: Localization (the core contract this package implements)
- s0021: Data Access (catalog loading)
- s0002: Application (translator factory injection)
- s0025: Pino Logger (the core-contract / backend-package precedent)

## Types

Types are shown erased to their widest form for readability. `Locale`, `Translator`, and
`TranslatorFactory` are the core types from s0026.

```typescript
type I18nOptions = {
    readonly default_locale: Locale;        // source/fallback locale
    readonly locales?: readonly Locale[];    // optional allow-list of loadable locales
    readonly catalog_dir?: string;           // subpath under the component data dir; default "i18n"
};

function defineI18n(options: I18nOptions): TranslatorFactory;
```

## Behavior

- `@jiminp/stelaro-i18n` provides a FormatJS-backed `TranslatorFactory` (s0026), usable as the
  `translator` of a `defineApplication` definition (s0002) with no change to core.
- `defineI18n` returns a factory that, per component, loads that component's per-locale JSON
  catalogs from its data directory via `DataAccess` (default `{component data}/i18n/{locale}.json`)
  and returns a `Translator`.
- For each `(component, locale)` it builds an immutable FormatJS message formatter from the loaded
  catalog. Translation is synchronous and concurrency-safe; the explicit locale argument selects
  the formatter — there is no ambient/active locale.
- Each message resolves via the catalog entry for the requested locale; if absent, the
  default-locale entry; if absent, the descriptor's `defaultMessage` — so the result is always
  readable source. ICU plurals/number/date use the platform `Intl`.
- Catalogs are JSON keyed by message id. An absent catalog file is treated as empty (the component
  falls back to source for that locale).

### Tooling

- A dev-time `extract → translate → compile` pipeline uses `@formatjs/cli` to extract
  `{id, defaultMessage}` descriptors directly from TypeScript source — no Babel/SWC transform in
  the build — into JSON catalogs for translation. Message ids are explicit (the optional
  id-hashing transform is not used).

## Constraints

- The package depends on the core localization contract (s0026) and FormatJS; core must not depend
  on the package.
- No ambient/active locale: a `Translator` selects the FormatJS formatter by the explicit locale
  argument, never by mutable global state.
- Catalog loading goes through `DataAccess` (s0021); the package does not read files directly.
- Unlike stelaro-pino (s0025 / d0002), the package constructs the FormatJS runtime from `I18nOptions`
  rather than wrapping a caller-provided instance — FormatJS has no single user-owned instance to
  wrap (formatters are per locale + message), so FormatJS is a direct dependency, not a peer.

## Anticipated Changes

- Precompiled catalogs (`@formatjs/cli compile`) may be adopted for faster runtime parsing.
- Locale negotiation / best-match helpers may be added.
- A bounded cache for per-`(component, locale)` formatters may be introduced if locale counts grow.

## Dangers

- Holding per-`(component, locale)` formatters unbounded could grow memory for many locales.
- Translator tools treat the ICU syntax inside catalog values as opaque; malformed plural/select
  from translators is only caught if the pipeline validates it.
