+++
id = "s0025"
title = "Pino Logger"
tags = ["logging", "pino"]
paths = ["packages/stelaro-pino/**"]
+++

## Related Specs

- s0001: High-Level Architecture (logging, pluggable transports)
- s0002: Application (logger factory)
- s0004: Context (Logger / LoggerFactory contract)

## Types

Types are shown erased to their widest form for readability. Implementations must be as
narrow as possible. Pino's `Logger` type is used directly from the `pino` package — the
package must not redefine it. `Logger`, `LoggerFactory`, and `ComponentId` are the core
types from s0004.

```typescript
function definePinoLogger(root: PinoLogger): LoggerFactory;
```

## Behavior

### Logger factory

- `@jiminp/stelaro-pino` adapts a pino logger into a Stelaro `LoggerFactory` (s0004), usable
  as the `logger` of a `defineApplication` definition (s0002) with no change to core.
- `definePinoLogger` receives a fully configured pino root logger and returns a
  `LoggerFactory`. It does not construct a pino instance: level, transports, and output
  formatting are configured by the caller on the pino instance it passes in.
- The returned factory produces one component-scoped `Logger` per component id. Each scoped
  logger exposes `debug`, `info`, `warn`, and `error`, mapped onto the matching pino levels.

### Component identity

- Every record emitted through a component-scoped logger carries its component id under a
  `component` field, so log records stay attributable to the component that produced them.
- Scoping derives from the pino root through a child logger, so caller-configured bindings,
  serializers, and level on the root apply to component records.

### Argument mapping

- The core `Logger` methods are variadic. When the first argument is a non-null, non-array
  object, its properties are merged into the structured record and the remaining arguments
  compose the message. Otherwise, all arguments compose the message.
- Message composition matches the default console logger's formatting, so emitted messages
  are consistent whether the console or pino backend is used.
- Because a leading object is merged, passing an `Error` produces pino's structured error
  record.

### Level filtering

- Log-level filtering is provided by the pino instance: records below the instance's
  configured level are suppressed. When the caller does not set a level, pino's default
  applies. This delivers the level-filtering capability deferred when component-scoped
  logging first shipped.

### Output and transport

- Structured JSON output for aggregation, human-readable development output (e.g.
  pino-pretty), and log shipping are all selected through the pino instance's own
  configuration. The destination is swappable without changing component log call-sites, so
  persistence and shipping stay additive (s0001).

## Constraints

- The package must not construct or own the pino instance's configuration; the caller
  provides a configured pino logger.
- The package must not redefine pino's types; pino's `Logger` is used directly.
- The package depends on the core logging contract (s0004); core must not depend on pino or
  on the package.
- Component ids must appear in emitted records.

## Anticipated Changes

- The component-id field name (`component`) may become configurable if callers need to align
  with an existing log schema.
- A convenience constructor that builds a pino instance from a curated options surface may be
  added if recurring setup patterns emerge across examples — intentionally omitted now; see
  d0002.

## Dangers

- Constructing or mutating the caller's pino configuration inside the package would create a
  parallel configuration surface that drifts from pino's own options over time (the
  parallel-type-system danger called out for gateways in s0015).
- Pre-formatting messages in a way that diverges from the default console logger would make
  switching backends silently change log output.
- Treating every leading object as a merge target — including arrays — could silently swallow
  content intended as the message.
