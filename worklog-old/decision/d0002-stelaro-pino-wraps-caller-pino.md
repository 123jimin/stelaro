+++
id = "d0002"
title = "stelaro-pino wraps a caller-provided pino instance"
relates_to = ["s0025"]
supersedes = []
+++

## Context

t0032 implements `@jiminp/stelaro-pino`, the pino-backed logging backend layered over the
core `LoggerFactory` contract (s0004). Two API shapes were considered:

- **A — adapter:** `definePinoLogger(instance)` adapts a caller-provided, fully configured
  pino logger. pino is a peer dependency.
- **B — constructor:** `pinoLoggerFactory(options)` constructs pino internally from a curated
  options surface (level, transport, pretty, passthrough). pino is a direct dependency.

## Choice

A. The package exposes a single entry point, `definePinoLogger(root): LoggerFactory`, that
adapts a caller-provided pino instance. pino is a **peer dependency**.

## Rationale

- **Consistency with the gateway packages.** s0016 (Fastify) and s0017 (Discord) establish
  the convention that an integration package *receives a pre-created runtime instance and
  does not construct it* ("receives a Fastify instance … does not create its own"; "receives
  a pre-created `Client` … does not create the client"), with the external runtime as a peer
  dependency. s0015 forbids wrapping platform-native objects in parallel abstractions.
- Constructing pino internally would force the package to curate and re-expose a slice of
  pino's configuration — a parallel config surface that drifts from pino's own options.
- t0032's requirement to surface transports/pretty/level "without touching log call-sites" is
  satisfied maximally by leaving the whole pino instance in the caller's hands. The package's
  only owned behavior is mapping the core variadic `Logger` onto pino's
  `(mergeObject?, message?, …)` convention and binding the component id.

## Consequences

- Callers configure level, transports, and formatting (including pino-pretty) on their own
  pino instance; the package adds no options bag.
- pino is a peer dependency; downstream applications install pino themselves.
- Level filtering (deferred when component-scoped logging first shipped) is delivered via
  pino's level.
- A convenience constructor may be added later if examples reveal repeated setup. This
  decision does not preclude it but records why it is omitted initially (s0025 Anticipated
  Changes).

## Naming

`definePinoLogger` was chosen over `createPinoLoggerFactory` and `pinoLoggerFactory`. It joins
the `define*` family (`defineComponent`, `defineFastifyGateway`, `defineDiscordGateway`) and
reads as "define the pino-backed logger for the application." `pinoLoggerFactory` was rejected
because it collides with core's `consoleLoggerFactory`, which *is* a `LoggerFactory` (called
with a component id) rather than a function returning one.
