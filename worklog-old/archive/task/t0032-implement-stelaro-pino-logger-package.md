+++
id = "t0032"
title = "Implement the stelaro-pino logger package"
status = "done"
tags = ["logging", "pino"]
modifies = ["s0025"]
blocked_by = []
+++

## Context

`packages/stelaro-pino` exists only as a stub (empty `src/index.ts`). t0007 shipped
component-scoped logging — the `Logger` / `LoggerFactory` contract (s0004) and the default
`consoleLoggerFactory` (s0001) — but explicitly deferred structured log transport, log
shipping, and log-level filtering. stelaro-pino is the follow-up that delivers those as an
optional, pluggable backend, the same way stelaro-fastify (s0016) and stelaro-discord layer
integrations over the core contracts.

## Scope

- Implement `@jiminp/stelaro-pino` as a pino-backed `LoggerFactory` (s0004): each
  `(component_id) => Logger` returns a `Logger` (`debug` / `info` / `warn` / `error`) that
  tags records with the component id and writes through pino.
- Level filtering — the gap t0007 deferred — configurable, with a sensible default.
- Structured output: JSON suitable for aggregation; human-readable (pino-pretty) for
  development.
- Pluggable transports/sinks: surface pino's transport configuration so the destination
  (console, file, aggregator, or a future database sink) is swappable without touching log
  call-sites — persistence and shipping stay additive.
- Drop-in via `defineApplication({ logger })` (s0002) with no change to core: the package
  depends on the core contract, not the reverse.
- Spec-derived tests; wire the package build into the workspace.

## Out of scope

- Lifecycle log call-sites inside core/gateways (server listening, component start/stop, call
  dispatch). Those are separate core and stelaro-fastify changes; this task only provides the
  backend they would log through.
- Wiring stelaro-pino into any downstream application.

## Notes

- Spec approach (resolved): new top-level sibling spec s0025 (`paths = ["packages/stelaro-pino/**"]`,
  tags `["logging", "pino"]`), mirroring s0016. Not placed under `spec/gateways/` — pino implements
  the logging contract, it is not a gateway (s0015). API shape and dependency model recorded in d0002:
  the package wraps a caller-provided pino instance (`definePinoLogger`), with pino as a peer dependency.
- The core `Logger` is variadic (`(...args: unknown[])`); the adapter must map it cleanly onto
  pino's `(mergeObject?, message?, ...)` calling convention.

## Implementation Summary

- Added covering spec s0025 (Pino Logger) governing `packages/stelaro-pino/**`. The
  wrap-a-caller-instance / peer-dependency design (vs. an internal `pinoLoggerFactory(options)`)
  is recorded in d0002, chosen for consistency with the gateway packages (s0016/s0017).
- Implemented `definePinoLogger(root)`: adapts a caller-provided pino logger into a core
  `LoggerFactory`. Each component id derives `root.child({component})`. The variadic core
  `Logger` maps onto pino's `(mergeObject?, message?)`: a leading non-null, non-array object is
  the merge target; remaining arguments are formatted console-style via `node:util.format`
  (avoids pino dropping non-format args and mangling arrays into index keys); `Error`s pass
  through to pino's serializer.
- pino is a peer dependency (`^10.0.0`) with a dev dependency (`^10.3.1`); added `pretest`/`test`
  (`node --test`) scripts mirroring core.
- Level filtering (the t0007-deferred gap), JSON/pretty output, and transports are owned by the
  caller's pino instance — no options bag — per d0002.

## Verification

- `pnpm --filter @jiminp/stelaro-pino test` — 10/10 pass (spec-derived).
- `pnpm --filter @jiminp/stelaro-pino lint` — clean.
- `pnpm -r --filter "./packages/*" build` — all 5 packages build; core 182/182 still pass.
- `validate.py` — clean.
- Note: installed with `corepack pnpm@10.33.3` to match the workspace's package manager; the
  `pnpm@11.5.0` currently on PATH wants to purge `node_modules` (store v10 → v11 drift).
