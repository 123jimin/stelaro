+++
id = "s0028"
title = "Logging"
tags = ["logging", "context", "application", "component"]
paths = ["packages/stelaro/src/component/logger.ts"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0028 and the logging
portion of legacy s0001.

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

- Every component receives `context.log`, created from its stable component id.
- An application may supply a logger factory. Core otherwise uses
  `consoleLoggerFactory`.
- The default logger prefixes output with its scope and maps `debug`, `info`,
  `warn`, and `error` to the matching console method while preserving arbitrary
  arguments.
- Core application and lifecycle behavior emits through this contract; s0002
  defines lifecycle events and levels.

## Constraints

- The core logging API is transport- and format-independent.
- Structured backends belong in separate packages; core MUST NOT depend on
  them.
- Changing transports MUST NOT require behavior to change how it emits logs.

## Anticipated Changes

- Backends may persist or ship logs to files, aggregation services, or database
  sinks.
