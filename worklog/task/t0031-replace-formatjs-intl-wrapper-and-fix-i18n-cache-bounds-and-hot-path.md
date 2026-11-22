+++
id = "t0031"
title = "Replace FormatJS intl wrapper and fix i18n cache bounds and hot path"
tags = ["i18n", "localization", "formatjs", "packages"]
modifies = ["s0003", "s0018"]
status = "pending"
+++

# Replace FormatJS intl wrapper and fix i18n cache bounds and hot path (NEEDS APPROVAL)

Fix unbounded locale/formatter caching and per-call overhead in `@jiminp/stelaro-i18n`, and drop the heavy `@formatjs/intl` wrapper in favor of `intl-messageformat` directly.

## Scope and design

- Replace `@formatjs/intl` (`createIntl` / `createIntlCache` / `@formatjs/fast-memoize` `JSON.stringify` cache keys) with direct `intl-messageformat` usage (checking `s0003` dependency rules).
- Eliminate per-call hot-path overhead in `t()` (`packages/stelaro-i18n/src/index.ts`):
  - Avoid `Object.assign(Object.create(null), values)` when `values == null`.
  - Fast-path plain static messages containing no ICU syntax characters (`{`, `}`, `'`) without invoking `IntlMessageFormat`.
  - Cache compiled `IntlMessageFormat` instances in a direct `Map` (keyed by locale and message text) without `JSON.stringify` serialization of options/formatter objects.
- Bound locale/formatter caching against arbitrary untrusted caller locales:
  - Avoid growing unbounded caches for arbitrary unknown locale strings (e.g., resolve/canonicalize against configured/seeded locales or bound cache size / fall back to `default_locale` before caching).
- Preserve all existing `s0018` fallback, error-logging, concurrent-locale, and browser-safe contracts.

## Completion criteria

- Review `intl-messageformat` against `s0003` and update `packages/stelaro-i18n/package.json` to remove `@formatjs/intl`.
- Reconcile `s0018` (removing `@formatjs/intl` `IntlShape` implementation detail and updating Dangers/cache behavior accordingly).
- Implement direct `intl-messageformat` formatting, static fast-path, zero-allocation no-values handling, and bounded locale caching in `packages/stelaro-i18n/src/index.ts`.
- Add tests covering static messages, repeated lookups, unknown/untrusted locales not growing internal formatter state without bound, malformed ICU fallback, and missing interpolation values.
- Pass `pnpm build`, `pnpm lint`, and `pnpm test`.
