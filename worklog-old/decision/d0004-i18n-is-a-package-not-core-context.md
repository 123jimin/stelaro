+++
id = "d0004"
title = "i18n lives in a package, not the core context"
relates_to = ["s0027", "s0004"]
supersedes = []
+++

## Context

t0035 first specified localization the way logging is specified: a `Translator` contract in core,
a `context.t` field on `ComponentContext` (s0004), a translator factory on `ApplicationDefinition`
(s0002), and a core localization spec (s0026). That makes i18n a core concern.

## Choice

Localization is not a core concern. The core `ComponentContext` has no `t`, and core has no
translator factory. `@jiminp/stelaro-i18n` is an optional companion package; a component that needs
translation wires an `I18n` holder into its own component state (s0003), loads catalogs in `start`
via `DataAccess`, and calls it from handlers. The core i18n additions to s0001/s0002/s0003/s0004 are
backed out and the core localization spec (s0026) is dropped; the whole contract lives in s0027.

## Rationale

- Logging is genuinely core (always present, with a core default), so `log` belongs on the base
  context. i18n is optional — baking `context.t` and a translator factory into core forces an
  optional concern onto every application.
- A companion package cannot cleanly add a typed field to the core context anyway:
  `ComponentContext` is a closed `type` alias, not an `interface`, so it is not module-augmentable,
  and core builds the context object, so a package has no runtime entry point to populate `t`.
  Giving core a generic context-extension seam (an augmentable interface plus runtime capability
  providers) would be a real new core feature with a global-augmentation type-vs-runtime gap.
- Wiring the translator through component state needs zero core change, keeps core ignorant of
  i18n, and is explicit (no magic) — consistent with Stelaro's bias.

## Consequences

- The core context, `ApplicationDefinition`, and s0001's behavior carry no localization. s0026 is
  deleted; s0027 is the single home for the contract and the FormatJS backend.
- A component holds an `I18n` in state: `createI18n` (sync) in the state factory, `load(data)` in
  `start`, `t(...)` in handlers — non-null, no assertion (the holder always exists, and `t` returns
  source before or without `load`).
- There is no application-level i18n injection (unlike `LoggerFactory`); i18n is per-component
  wiring. A `withI18n` wrapper may reduce the boilerplate later.
- If several packages later need to add context capabilities, a generic core context-extension
  mechanism may be reconsidered — explicitly, as its own decision.
