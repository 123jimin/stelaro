+++
id = "s0014"
title = "Pino"
tags = ["logging", "pino"]
paths = ["packages/stelaro-pino/**"]
+++

# Pino (UNIMPLEMENTED)

## Types

`PinoLogger` denotes Pino's own `Logger` type.
Implementations SHOULD use it directly and keep the adapter as narrow as possible.

```typescript
type PinoLoggerFactory = LoggerFactory & {
    childPinoLogger(component_id: string): PinoLogger;
};
function definePinoLogger(root: PinoLogger): PinoLoggerFactory;
```

## Behavior

- `definePinoLogger` adapts a caller-configured Pino root into the `LoggerFactory` in s0013.
- Each scope is a Pino child logger with the component ID bound to `component`.
  - `childPinoLogger` returns a new child with the same binding for callers that pass a logger to another library.
  - Root bindings, serializers, and level apply to child records.
- `debug`, `info`, `warn`, and `error` map to the corresponding Pino levels.
  - Pino's configured level filters records.
- When the first argument is a non-null object other than an array, its properties merge into the structured record and the remaining arguments compose the message.
  - A leading `Error` uses Pino's structured error handling.
  - In all other cases, every argument contributes to the message.
- Message composition matches the default console logger.
  - The caller may specify output format, development prettification, transport, and shipping through Pino configuration.

## Constraints

- The package SHOULD NOT construct, own, or mutate Pino configuration or redefine Pino types.
- Every emitted record SHOULD carry its component ID.
- Package dependencies follow s0002.

## Anticipated changes

- The `component` field may become configurable.
- A curated Pino constructor may be added only after setup patterns recur.
