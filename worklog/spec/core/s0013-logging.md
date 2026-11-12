+++
id = "s0013"
title = "Logging"
tags = ["application", "component", "context", "logging"]
paths = ["packages/stelaro/src/component/logger.ts"]
+++

# Logging

## Types

```typescript
type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

type LoggerFactory = (scope: string) => Logger;

function consoleLoggerFactory(scope: string): Logger;
```

## Behavior

- `consoleLoggerFactory` maps `debug`, `info`, `warn`, and `error` to the corresponding Node.js console methods while preserving arbitrary arguments.
- The output starts with `[scope]`, with the scope used as literal text. When arguments are present, a space separates the prefix from the message.
  - Compose the message using the console's usual formatting, including format specifiers and inspection of values.
  - Adapters can use `node:util`'s `format` with the arguments that contribute to the message.

## Application and component integration (UNIMPLEMENTED)

- Every component receives `context.log` from the logger factory, scoped to its stable component ID.
- An application may supply a logger factory.
  - Core uses `consoleLoggerFactory` by default.
- Application lifecycle and signal handling log through this contract.
  - See s0006 for those events and s0014 for the Pino adapter.

## Constraints

- The core logging API is independent of transport and format.
  - Changing transports MUST preserve how component behavior emits logs.
- See s0002 for the dependency boundary between core and structured logging backends.

## Anticipated changes

- Backends may persist or ship logs to files, aggregation services, or database sinks.
