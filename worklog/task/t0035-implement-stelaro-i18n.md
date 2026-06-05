+++
id = "t0035"
title = "Implement stelaro-i18n: component-scoped localization"
status = "active"
tags = ["i18n", "localization", "component", "context"]
modifies = ["s0001", "s0002", "s0003", "s0004"]
blocked_by = []
+++

## Context

Localization is a framework-level, gateway-agnostic concern: a web server, a Discord bot, and a
CLI on stelaro all need to translate. stelaro has none today (s0021 only *anticipates*
`data/{locale}/`, unbuilt). This adds localization as a component-scoped capability, mirroring
how logging (t0007) is component-scoped — each component owns its messages, and the app injects
the backend the way it injects the `LoggerFactory` (s0002), with the heavy runtime in a companion
package (cf. stelaro-pino / s0025).

This task is larger than a typical single-session task and is intentionally kept whole (not
split): designing the covering spec(s) is the first step of implementation, not a separate task.

## Scope

Ordered; the spec work gates the rest.

- **Spec first.** Write the covering spec(s) before implementing: a core localization spec (the
  context capability + injectable factory + fallback semantics) and a stelaro-i18n package spec
  for the runtime backend (cf. s0025 for stelaro-pino). Settle the core-interface-vs-package split
  here.
- **Core contract.** A gateway-agnostic translation capability on the component context (e.g.
  `context.t`), scoped to the component, resolving a message for a given locale + id with ICU
  MessageFormat (plurals / select / interpolation). Components have no request context (s0002 /
  s0004), so **locale is an explicit argument** (from call input), never ambient.
- **Injectable backend.** A translator factory on `defineApplication` (like `logger` /
  `LoggerFactory`), so the ICU runtime lives in the companion `stelaro-i18n` package and core
  stays light — core ships at most a default source/identity translator (the i18n analogue of
  `consoleLoggerFactory`).
- **Per-component, opt-in catalogs by presence.** A component's catalog is its files under its own
  data dir (namespace = component id); a component with no catalog files simply doesn't translate.
  No declaration on the component (consistent with DataAccess, s0021) — at most a one-line
  behavioral note in s0003.
- **Fallback chain:** requested locale → default locale → source text. With FormatJS the source
  travels as each message's `defaultMessage`, so a missing translation always yields readable
  source text, never a blank or the bare id.
- **Catalogs + pipeline.** JSON catalogs (FormatJS), loaded via `context.data.resolve(...)`
  (s0021) — the backend owns its locale path layout (e.g. `i18n/{locale}.json`), so s0021's
  anticipated `data/{locale}/` resolution is NOT required. Dev-time `extract → translate →
  (pre)compile` via `@formatjs/cli`, which parses TS source as a standalone step (no Babel/SWC in
  the tsc runtime build).

## Out of scope

- Web delivery — locale routing, SSR-in-locale, shipping the active catalog to the browser — is
  gateway/app-specific (the consuming app's i18n spec), not core.
- Localized long-form content (article/wiki bodies) beyond UI message catalogs.
- A CI pipeline syncing catalogs to a hosted translation platform.

## Notes

- **Runtime: FormatJS** (`@formatjs/intl` + `intl-messageformat`), chosen over Lingui:
  - It formats per `(locale, message)` with **no ambient active locale** (`createIntl({locale,
    messages})` / `new IntlMessageFormat(msg, locale)`), fitting the explicit-per-call,
    concurrency-safe requirement. Lingui's `i18n.activate()` is global mutable state — racy for a
    server translating multiple locales at once.
  - `@formatjs/cli` extracts `{id, defaultMessage}` descriptors directly from TS source as a
    standalone dev step — no Babel/SWC macro transform in stelaro's tsc/type-stripping build
    (Lingui's ergonomic macro extraction would have required one). Use explicit ids; skip the
    optional `@formatjs/ts-transformer` (it needs a tsc plugin).
  - Trade-off: JSON catalogs, not gettext `.po` (accepted — Crowdin/Weblate handle FormatJS/ICU
    JSON; only Poedit is `.po`-bound). Record the runtime choice as a decision when implementing.
  - ICU plurals/number/date use Node's built-in `Intl` (no CLDR bundle), keeping the companion
    runtime light.
- The backend caches one immutable `intl` per `(component, locale)`, selected by the call's locale
  argument — no shared mutable locale state.
- `modifies` mirrors t0007 (logging touched s0001–s0004); confirm each during spec work. s0003's
  change should be minimal (catalogs are convention-based, not a declared field). s0021 is NOT
  modified — the backend uses existing `DataAccess.resolve`.
- Verify current `@formatjs/intl` / `intl-messageformat` / `@formatjs/cli` versions at
  implementation (don't presume).
- Spec-derived test: drive translation through a component context (with the real FormatJS backend
  injected) and assert locale resolution, ICU plural/select output, and fallback-to-source.
