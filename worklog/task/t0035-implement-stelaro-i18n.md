+++
id = "t0035"
title = "Implement stelaro-i18n: component-scoped localization"
status = "active"
tags = ["i18n", "localization", "component", "context"]
modifies = ["s0027"]
blocked_by = []
+++

## Context

Localization is a gateway-agnostic concern, but — unlike logging — it is optional, so it does NOT
belong in the core context (d0004). `@jiminp/stelaro-i18n` is an optional companion package (cf.
stelaro-pino / s0025). A component that needs translation wires an `I18n` holder into its own
component state (s0003), loads catalogs in `start` via `DataAccess` (s0021), and calls it from
handlers. Core — `ComponentContext`, `ApplicationDefinition` — is untouched.

The covering spec is s0027 (the single home for the contract and the FormatJS backend). The earlier
core-context design (`context.t`, a translator factory on `defineApplication`, a core localization
spec s0026) was backed out — see d0004.

## Scope

- **Spec (done this session).** s0027 specifies the package; the core specs are untouched (d0004).
- **Package `@jiminp/stelaro-i18n`** — implement against s0027:
  - `createI18n(options): I18n` — synchronous holder (state-factory-safe).
  - `I18n.load(data)` — async; loads per-component JSON catalogs from the component data dir
    (`i18n/{locale}.json`) via `DataAccess`.
  - `I18n.t(locale, message, ...values)` — synchronous; formats with `intl-messageformat`; fallback
    requested → `default_locale` → source (`defaultMessage`); never blank.
  - `defineMessages(...)` — typed, literal-preserving source descriptors for `ParamsOf` inference
    and extraction.
- **Typed `t`** — infer keys/params from the descriptor argument (no core context generic); simple
  `{placeholder}` params typed, complex ICU degrades to a loose value record.
- **Tooling** — dev-time `@formatjs/cli` extraction of `{id, defaultMessage}` from TS source (no
  Babel/SWC in the tsc build).
- **Wire the package build into the workspace; spec-derived tests.**

## Out of scope

- Web delivery — locale routing, SSR-in-locale, shipping the active catalog to the browser — is
  gateway/app-specific (the consuming app's i18n spec), not core.
- Localized long-form content (article/wiki bodies) beyond UI message catalogs.
- A CI pipeline syncing catalogs to a hosted translation platform.
- Any core change — a generic context-extension mechanism is explicitly deferred (d0004).

## Notes

- **Runtime: FormatJS** (`@formatjs/intl` / `intl-messageformat`): per-`(locale, message)`
  formatting, no ambient active locale (fits explicit-per-call, concurrency-safe), `@formatjs/cli`
  extraction over TS source. JSON catalogs, not gettext `.po` (accepted). Runtime rationale lives
  in s0027 and this task's history.
- **No `state.i18n!`.** The holder is created synchronously in the state factory, so the state
  field is non-null; `load` runs in `start`; `t` returns source before/without `load`. No assertion.
- A `withI18n(options, definition)` wrapper may later inject the state + start wiring (s0027
  Anticipated Changes).
- Verify current `@formatjs/intl` / `intl-messageformat` / `@formatjs/cli` versions at
  implementation (don't presume).
- Spec-derived test: construct a component holding an `I18n` in state, drive `load` + `t`, and
  assert locale resolution, ICU plural/select output, and fallback-to-source (including pre-`load`).
