+++
id = "t0037"
title = "stelaro-i18n: gateway-agnostic runtime — in-memory seed + locale-bound bind"
status = "done"
tags = ["i18n", "localization", "formatjs"]
modifies = ["s0027"]
blocked_by = []
+++

## Context

stelaro-i18n's translation runtime — `t(locale, message, …)`, the per-locale `IntlShape`, the
FormatJS fallback chain — is already gateway-agnostic. But the only way to *populate* its catalogs
is `load(data: DataAccess)`, and `DataAccess` is a server/filesystem capability (s0021). So the
runtime is unreachable anywhere a filesystem isn't: a browser, or any gateway that delivers a
catalog to a remote client. The translator can be *constructed* without I/O (createI18n is sync),
and it can *format* without I/O (`t`), but it cannot be *fed a catalog* without `DataAccess`.

The missing capability is gateway-agnostic: **populate a catalog from memory**, decoupled from how
the catalog was acquired. A gateway loads/ships a catalog its own way (file, network, embedded); the
runtime should reconstruct anywhere from that in-memory data.

This is the inverse of, and supersedes, the rejected "expose the loaded catalog" getter idea: that
read a catalog *out* of an `I18n` (server-side, delivering nothing); this seeds a catalog *into* an
`I18n` (any context), which is what lets a client rebuild the same runtime from a delivered catalog.

Concrete motivation (cross-repo): new.r-g.kr t0001 had to reimplement `createIntl` + the
MISSING_TRANSLATION fallback in its web layer purely because stelaro-i18n could not run client-side.
Its decision **d0012** now makes stelaro-i18n the single translation runtime on both server and
client and deletes that reimplementation — which depends on the seed (client construction) and
`bind` (the view's locale-bound `t`) below. The reimplemented logic is gateway-agnostic and belongs
here.

## Scope

- Add an in-memory seeding path to `createI18n` so an `I18n` can be populated without `DataAccess`:
  an optional `messages` on `I18nOptions`, `messages?: Readonly<Partial<Record<Locale, Catalog>>>`,
  seeded at construction. **Decided: a constructor option, not a `seed()`/`use()` method** —
  `createI18n` is synchronous and the consumer has the catalog at construction time (client
  hydration, or fetch-then-construct), so no post-construction mutation is needed; a constructor
  option preserves the construct-sync / no-mutable-state model and mirrors the other `I18nOptions`
  fields. `t` must work immediately for seeded locales, with no `load` call. Backward-compatible —
  `messages` is optional and existing callers are unaffected.
- Define seed-vs-`load` population semantics: both paths populate the same per-locale catalogs, and
  **`load` overlays the seed at the id level** — for a locale present in both, `load`'s ids win and
  seeded-only ids survive (collapses to today's wholesale behavior when the two don't overlap).
  Implementation: `load`'s current per-locale `set(locale, catalog)` becomes
  `set(locale, {...existing_seeded, ...catalog})`.
- Export the `Catalog` type publicly (currently an internal alias): `Record<MessageId, string>` —
  the runtime catalog shape a consumer needs to type the catalog it seeds. **Decided: strings only,
  AST deferred.** `@formatjs/intl` also accepts a precompiled AST catalog
  (`Record<id, MessageFormatElement[]>`) as `createIntl` `messages`, but `MessageFormatElement` is a
  large recursive union not re-exported by `@formatjs/intl` and not cleanly replicable (it rests on
  the `TYPE`/`SKELETON_TYPE` runtime enums and `@formatjs/icu-skeleton-parser`), so typing it would
  force a direct `@formatjs/icu-messageformat-parser` dependency. The client-runtime motivation
  works on string catalogs; AST seeding is out of scope here and is revisited only when
  `@formatjs/cli compile --ast` is actually exercised — at which point `Catalog` widens to the
  record-level union `Record<id, string> | Record<id, MessageFormatElement[]>` (NOT a per-entry
  union: a catalog is homogeneous, matching `createIntl`).
- Add a locale-bound translator `I18n.bind(locale): BoundI18n`, where `BoundI18n.t(message, …values)`
  curries the explicit locale away while preserving the typed-`t` inference (`MessageValues` /
  `OptionalIfVoid`). Gateway-agnostic ergonomics: a view binds once per request and a server handler
  binds once per user-locale, neither repeating the locale per call. (Consumer motivation: a web
  gateway's Preact binding holds a `BoundI18n` in context; see new.r-g.kr d0012.)
- Update s0027: `I18nOptions` (the `messages` field), the public `Catalog` type, the `bind` method
  + `BoundI18n` type, and Behavior bullets — in-memory seeding as a gateway-agnostic acquisition
  path alongside `load` (`t` works before/without `load` for seeded locales; `load` overlays the
  seed per id) and `bind` as a locale-curried translator equivalent to `t(locale, …)`. Also clarify
  that `I18nOptions.locales` gates only what `load` reads from files — seeding via `messages` is
  independent, so a seeded locale formats through `t` even if it is not listed in `locales`.

## Out of scope

- Any gateway- or framework-specific glue: a Preact/React provider, HTML hydration, HTTP
  `Accept-Language`/cookie negotiation, catalog *delivery* to a client. These belong to the
  consuming gateway/app, not this package.
- Reading a catalog back out of an `I18n` (the rejected getter) — not part of this.
- Browser bundling concerns (the consumer allowlists this package).
- Changes to `t`, the FormatJS fallback chain, `defineMessages`, or `load`'s DataAccess behavior
  beyond sharing the populated catalogs with the new seed path.

## Notes

- **Behavioral addition to s0027** — confirm on the stelaro side before implementing. Spec first
  (spec is authoritative), then implementation; tests derive from the spec, not the code.
- **Test isolation** (spec only, no source under s0027's `paths`): construct an `I18n` with in-memory
  `messages` and **without** calling `load`/touching `DataAccess`; assert `t` returns the seeded
  translation for a seeded locale, falls back to source for a missing id, and that the holder is
  usable with no `DataAccess` present at all. If both `load` and seed populate a locale, assert
  `load`'s id overrides the seeded value while seeded-only ids survive. For `bind`, assert
  `bind(locale).t(message, …)` equals
  `t(locale, message, …)` across seeded, missing-id (source fallback), and interpolated messages.
- Gateway-agnostic constraint: no HTTP, Preact, or gateway types in the API — only `Locale`,
  `Catalog`, and message data.
- AST catalog seeding was deferred (see the `Catalog` scope bullet): `createIntl` accepts AST
  (`IntlConfig.messages`, verified against `@formatjs/intl` 4.1.12), but `MessageFormatElement` is
  not re-exported and is too large/recursive to replicate, so adopting it would mean a direct
  `@formatjs/icu-messageformat-parser` dependency for a path not yet exercised. Strings-only avoids
  the dep entirely; widen later, when `compile --ast` is real.
- Unblocks the new.r-g.kr i18n rework mandated by its d0012: one stelaro-i18n runtime on both ends
  (seed for the client, `bind` for the view), deleting `createIntlFor`. Cross-repo, so not
  expressible via `blocked_by`.
