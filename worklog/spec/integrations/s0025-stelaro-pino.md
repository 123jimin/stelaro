+++
id = "s0025"
title = "Pino Logger"
tags = ["logging", "pino"]
paths = ["packages/stelaro-pino/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0025.

## Types

Implementations MUST use pino's `Logger` directly and keep the adapter as
narrow as possible.

```typescript
function definePinoLogger(root: PinoLogger): LoggerFactory;
```

## Behavior

- `definePinoLogger` adapts a caller-configured pino root into the s0028
  `LoggerFactory`; it does not create or configure pino.
- Each scope is a pino child logger carrying its component id in `component`.
  Root bindings, serializers, and level apply to child records.
- `debug`, `info`, `warn`, and `error` map to the matching pino levels; pino's
  configured level performs filtering.
- When the first argument is a non-null, non-array object, its properties merge
  into the structured record and remaining arguments compose the message.
  Otherwise all arguments compose the message. A leading `Error` therefore
  uses pino's structured error handling.
- Message composition matches the default console logger. Output format,
  development prettification, transport, and shipping remain caller-owned pino
  configuration.

## Constraints

- The package MUST NOT construct, own, or mutate pino configuration, or
  redefine pino types.
- Core MUST NOT depend on pino or this package.
- Every emitted record MUST carry its component id.

## Anticipated Changes

- The `component` field may become configurable. A curated pino constructor may
  be added only after setup patterns recur.
