+++
id = "d0005"
title = "stelaro-i18n loads via a caller-supplied reader, not DataAccess"
relates_to = ["s0027"]
supersedes = []
+++

## Context

`@jiminp/stelaro-i18n` is a gateway-agnostic translation runtime meant to run on both server and
client (one runtime on both ends; cf. the cross-repo new.r-g.kr d0012). Its original loading path
took `DataAccess` (s0021) — a server/filesystem capability from the core framework. After in-memory
seeding + `bind` landed (t0037), `load(data: DataAccess, log?: Logger)` still sat on the holder
returned by `createI18n`. That exposed server-side code through the public API:

- the public `I18n` type named `@jiminp/stelaro`'s `DataAccess`, forcing every consumer (a browser
  included) to depend on the server framework's types and presenting an unusable server method;
- `@jiminp/stelaro` — the whole server framework (cli, fs, application, signal, …) — was a runtime
  `dependencies` entry, dragged into any client that installs the package.

## Choice

`load` takes a caller-supplied async reader instead of `DataAccess`:
`CatalogReader = (subpath: string) => Promise<unknown>` (resolving null/absent ⇒ empty catalog).
`Logger` becomes a minimal structural type defined in the package (a component's `context.log`
satisfies it). The `@jiminp/stelaro` dependency is dropped entirely. The package's only runtime
dependency is `@formatjs/intl` (plus `@jiminp/tooltool` for types).

A server component adapts its `DataAccess`: `load(p => ctx.data.read(p).optional().json(), ctx.log)`.
A browser supplies a `fetch`-backed reader. In-memory seeding via the `messages` option needs no
reader at all.

Considered and rejected: splitting a server-only `@jiminp/stelaro-i18n/server` entry that keeps the
`DataAccess` ergonomics (more machinery — subpath exports + an ingest seam on the holder); and a
dependency-only fix (peer/type-only `@jiminp/stelaro`) — insufficient, since `load(data: DataAccess)`
would remain on the client-facing type.

## Rationale

The reader is the minimal seam that makes the runtime genuinely gateway-agnostic: the package no
longer names or depends on the server framework, yet `load` works against any source — `DataAccess`,
`fetch`, or a test stub. This keeps a single `load` (no API split) while removing the coupling at
both the type and dependency level.

## Consequences

- s0027 reverses its "catalog loading goes through `DataAccess` (s0021)" contract: loading goes
  through the reader; the component (not the package) adapts `DataAccess`. s0021 stays related only
  as the thing a component adapts.
- The component wiring is slightly more verbose (`load(p => ctx.data.read(p).optional().json(), …)`);
  the anticipated `withI18n` helper can bury it.
- The package becomes installable in a browser without pulling the server framework.
- A future precompiled-AST `Catalog` (deferred) is orthogonal — it would touch the catalog *shape*,
  not the reader seam.
