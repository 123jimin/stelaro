+++
id = "t0033"
title = "Log lifecycle transitions and gateway listening"
status = "done"
tags = ["logging", "lifecycle", "gateway"]
modifies = ["s0002", "s0016"]
blocked_by = []
+++

## Context

Component-scoped logging shipped (t0007) and a structured pino backend now exists (t0032 /
s0025), but the framework is silent at runtime: the application runner enters every lifecycle
transition without logging (only missing-secrets warnings exist), and the fastify gateway
calls `server.listen()` / `server.close()` silently. The loggers are already in hand —
`framework_log` (scoped `stelaro`) and per-component `runtime.log` in core, `context.log` in
the gateway's start and stop hooks — they are simply never called. This task adds the missing
call-sites.

Backend-agnostic: the calls route through the injected `LoggerFactory`, so they work with the
default console logger and gain structure under stelaro-pino — no hard dependency on t0032.

## Scope

Two layers, kept distinct:

- **Core — generic lifecycle** (in the application runner). Log each transition through the
  loggers already in scope:
  - Application start/stop: `starting` → `active` → `stopping` → `idle` via `framework_log`
    (info). Events are named after the actual `LifecycleState` (`app.starting`, `app.active`,
    `app.stopping`, `app.idle`) — there is no `started`/`stopped` state.
  - Application config reload (`reloadConfig`, `reloadComponentConfig`): the `active` →
    `reloading` → `active` transition via `framework_log` (info: `app.reloading`, then
    `app.active`). `reloadComponentConfig` carries the target component id on the record.
  - Per component start/stop: `starting` → `active` → `stopping` → `idle` via `runtime.log`
    (debug: `component.starting`, `component.active`, `component.stopping`, `component.idle`).
  - Any failure transition (start, stop, or reload entering `failed`): error via the matching
    logger, carrying the error object (`app.failed` / `component.failed`).
  - Every component gets start/stop logs with no per-component code. Reload transitions are
    app-level only: the per-component `runtime.lifecycle` does not change during reload, so
    reload is not logged as a component-state transition.
- **Gateway — protocol detail** (stelaro-fastify). Log the listening address (host/port) after
  `server.listen()` via `context.log` (info: `gateway.listening`) — only the gateway knows it.
  The gateway's `stop(context)` hook already receives `context.log` (same context as `start`),
  so log the close directly there (`gateway.closed`, info), alongside core's per-component
  `component.idle` line. No closure trick and no core change needed.
- **Structure.** Each record carries a stable `event` field named after the lifecycle state or
  protocol event (`app.active`, `component.active`, `gateway.listening`, …) and, on terminal
  transitions, a `ms` duration measured with a monotonic clock. Emit these as a leading object
  (`log.info({event, ms}, "…")`) so the s0025 pino mapping captures them as real fields while the
  message stays human-readable; `component` is already tagged by the scoped logger.

## Out of scope

- Request/response logging — that is Fastify's own (caller-configured) logger; an app unifies
  by sharing one pino root with `definePinoLogger`. Not a framework change.
- Call-dispatch / validation-failure logging (separate concern).

## Notes

- Verbosity is the configured logger's level (pino level / default console) — no separate enable
  flag. Default levels: application start/stop/reload and gateway listening/close at info;
  per-component start/stop at debug; any `failed` transition at error. Backend divergence to
  expect: per-component `debug` lines are suppressed under pino's default (`info`) level but are
  printed by `console.debug` under the default console logger.
- Spec updates are part of the work and are behavioral, so they require explicit confirmation
  before the spec is edited: s0002 gains "application and component lifecycle transitions (start,
  stop, config reload) are logged"; s0016 gains "the gateway logs its listening address on start
  and its close on stop." s0001's logging architecture is unchanged.
- Spec-derived test: the runner's transition logs are observable via a capturing `LoggerFactory`
  (the harness already exists in `application.spec.ts`), so event order and levels can be
  asserted without reading the implementation. Assert `ms` is a non-negative number, never an
  exact value.
- Existing-test impact: the default-console-logger test in `application.spec.ts` asserts exactly
  one `console` call per level. Once the runner emits lifecycle records through the default
  logger that assertion breaks and must be updated — it currently encodes "the framework is
  silent."

## Implementation Summary

- Core lifecycle logging in the application runner: application start/stop/reload transitions via
  `framework_log` (info) and per-component start/stop via `runtime.log` (debug); failures at error.
  Events are named after `LifecycleState` (`app.starting`/`app.active`/`app.stopping`/`app.idle`,
  `component.*`, `app.reloading`, `*.failed`); start/stop/reload records carry an elapsed `ms`.
- Refactor (per follow-up review): per-component start/stop logic extracted into module-level
  `startComponent` / `stopComponent` (behavior-preserving) so a single component can be
  (re)started independently — groundwork for HMR (t0012 / s0006). The `start`/`stop` loops
  delegate to them.
- Reload transitions (`reloadConfig`, `reloadComponentConfig`) logged at the application scope;
  single-component reload carries the target id.
- Gateway (stelaro-fastify): logs `gateway.listening` (with address) after `server.listen()` and
  `gateway.closed` on stop via `context.log` (the `stop(context)` hook already receives the logger).
- Structured fields are emitted as a leading object so they merge under stelaro-pino (s0025) and
  print under the default console logger.

## Verification

- `pnpm --filter @jiminp/stelaro test` — 188/188 (incl. 6 new lifecycle-logging tests; the
  refactor is covered by the unchanged existing suite as a safety net).
- `pnpm --filter @jiminp/stelaro-fastify test` — 2/2 (new gateway test, fastify stand-in).
- Updated the default-console-logger test to locate the handler's own record rather than assume a
  single console call.
- `pnpm -r --filter "./packages/*" build` — all 5 packages build; lint clean.
- `validate.py` — clean.
