+++
id = "s0013"
title = "Logging"
tags = ["application", "component", "context", "logging"]
paths = ["packages/stelaro/src/component/logger.ts"]
+++

# Logging (UNIMPLEMENTED)

## Types

```typescript
type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

type LoggerFactory = (scope: string) => Logger;
```

## Behavior

- Every component receives `context.log` from the logger factory, scoped to its stable component ID.
- An application may supply a logger factory.
  - Core uses `consoleLoggerFactory` by default.
- The default logger prefixes output with its scope and maps `debug`, `info`, `warn`, and `error` to the corresponding console methods while preserving arbitrary arguments.
- Application lifecycle and signal handling log through this contract.
  - See s0006 for those events and s0014 for the Pino adapter.

## Constraints

- The core logging API is independent of transport and format.
  - Changing transports MUST preserve how component behavior emits logs.
- See s0002 for the dependency boundary between core and structured logging backends.

## Anticipated changes

- Backends may persist or ship logs to files, aggregation services, or database sinks.
