+++
id = "t0032"
title = "Implement the stelaro-pino logger package"
status = "pending"
tags = ["logging", "pino"]
modifies = ["s0001", "s0004"]
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

- A covering spec is needed before implementation. s0016 (`paths = ["packages/stelaro-fastify/**"]`)
  is the precedent — write a sibling spec for `packages/stelaro-pino/**`, or fold the
  structured-logging behavior into s0001/s0004. Decide the spec approach when work starts.
- The core `Logger` is variadic (`(...args: unknown[])`); the adapter must map it cleanly onto
  pino's `(mergeObject?, message?, ...)` calling convention.
