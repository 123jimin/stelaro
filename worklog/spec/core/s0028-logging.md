+++
id = "s0028"
title = "Logging"
tags = ["logging", "context", "application", "component"]
paths = ["packages/stelaro/src/component/logger.ts"]
+++

## Related Specs

- s0001: High-Level Architecture (logging as a cross-cutting concern)
- s0002: Application (logger factory injection; lifecycle-transition logging)
- s0004: Context (`context.log`)
- s0025: Pino Logger (a structured backend)

## Types

Types are shown erased to their widest form for readability. `ComponentId` is the core type
from s0003.

```typescript
type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

type LoggerFactory = (component_id: ComponentId) => Logger;
```

`ComponentContext` (s0004) gains `readonly log: Logger`.

## Behavior

- Logging is component-scoped: each component receives a `Logger` scoped to its id, the same way
  configuration and translation are component-scoped.
- A `Logger` supports `debug`, `info`, `warn`, and `error`, each accepting arbitrary arguments.
- The backend is injectable: an application definition may provide a `LoggerFactory` (s0002);
  with none, core uses a default console logger.
- The default console logger prefixes output with `[component_id]` and maps `debug` / `info` /
  `warn` / `error` to the matching `console` methods.
- Application and component lifecycle transitions are logged through these loggers; the event
  taxonomy (`app.*` / `component.*`) is specified with the application lifecycle (s0002).

## Constraints

- Core stays backend-agnostic: the core contract carries no transport or formatting; structured
  backends (e.g. s0025) live in packages. Core must not depend on them.
- A logger accepts arbitrary arguments and must not throw on serialization of its inputs.

## Anticipated Changes

- Log output may be routed to pluggable transports (file, aggregation backend, database sink)
  without changing how behavior emits logs (s0001) — realized by backends such as s0025.

## Dangers

- Coupling the core contract to a specific transport or format would prevent swapping backends.
