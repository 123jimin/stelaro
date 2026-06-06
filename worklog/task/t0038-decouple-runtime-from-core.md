+++
id = "t0038"
title = "stelaro-i18n: decouple the runtime from @jiminp/stelaro (client-safe boundary)"
status = "done"
tags = ["i18n", "localization", "formatjs"]
modifies = ["s0027"]
blocked_by = []
+++

## Context

new.r-g.kr d0012 makes stelaro-i18n the single translation runtime on both server and client — its
browser bundle imports this package. t0037 added the in-memory seed and `bind` but left
client-bundle-safety out of scope and closed `done`, so the shipped package was still server-coupled:
`I18n.load(data: DataAccess, log?: Logger)` named `@jiminp/stelaro`'s core types, and the package
declared `@jiminp/stelaro` (the whole Node framework: cli, fs, application, …) as a runtime
dependency. The built dist value-imported only `@formatjs/intl`, so nothing leaked *yet* — which made
the consumer's s0003 boundary discipline-only: one future core value-import would silently bundle
Node into the browser. The client-facing runtime had to be structurally free of the core, not free by
coincidence.

## Scope (delivered — choice recorded in d0005)

- `load` takes a caller-supplied reader, `CatalogReader = (subpath: string) => Promise<unknown>`
  (null/absent ⇒ empty catalog), instead of `DataAccess`. A server component adapts its DataAccess —
  `load(p => ctx.data.read(p).optional().json(), ctx.log)`; a browser supplies a `fetch`-backed
  reader; in-memory `messages` need no reader at all.
- `Logger` becomes a minimal structural type owned by the package (`debug`/`info`/`warn`/`error`); a
  component's `context.log` and `console` both satisfy it.
- `@jiminp/stelaro` dropped from `dependencies`; the runtime's only value import is `@formatjs/intl`
  (`@jiminp/tooltool` remains, type-only). A single `load` — no `/server` subpath split (the split,
  and a dependency-only/type-only fix, were considered and rejected; see d0005).
- s0027 reconciled: loading goes through the reader, not `DataAccess` (s0021 stays related only as the
  thing a component adapts). The seed / `bind` / `Catalog` from t0037 are unchanged.

## Out of scope

- The in-memory seed, `bind`, `Catalog`, load/seed overlay — delivered in t0037; unchanged except
  `load`'s parameter type.
- The consumer's bundler allowlist/config (gateway-side).
- AST catalogs (deferred in t0037); orthogonal to the reader seam (d0005).

## Outcome

- Implemented and verified: `src/index.ts` exposes `CatalogReader`/`Logger` structural types and
  `load(read, log?)`; `package.json` no longer depends on `@jiminp/stelaro`; the dist was rebuilt
  (reflects the new source); s0027 updated; decision recorded in **d0005**; `index.spec.ts` updated.
- The s0003 boundary is now structural, not coincidental: the package neither names nor depends on the
  server framework. (An automated dist-leak assertion — "runtime value-imports only `@formatjs/intl`"
  — is optional belt-and-suspenders, not added here.)
- Unblocks the new.r-g.kr i18n rework (d0012): the web client can bundle stelaro-i18n's runtime
  without resting the boundary on discipline. Cross-repo, not expressible via `blocked_by`.
