+++
id = "t0007"
title = "Implement component-scoped logging"
status = "pending"
tags = ["logging", "component", "context", "application"]
modifies = ["s0001", "s0002", "s0003", "s0004"]
blocked_by = []
+++

## Scope

- Define a `Logger` interface with `debug`, `info`, `warn`, `error` methods.
- Each method accepts a message string and optional structured data.
- Add `log: Logger` to `ComponentContext`. Handlers and lifecycle hooks receive a logger pre-scoped to the component id.
- `ApplicationDefinition` accepts an optional `logger` factory: `(componentId: ComponentId) => Logger`.
- `createApplication` calls the factory per component to produce scoped loggers, then wires them into each component's context.
- Core ships a default `console`-based logger factory (`consoleLoggerFactory`) that prefixes output with the component id.
- When no `logger` factory is provided, the default console logger is used.
- Update affected specs (s0001, s0002, s0003, s0004) to remove `UNIMPLEMENTED` logging markers.

## Design Decisions

### Logger interface

```ts
type Logger = {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
};
```

### Logger factory

```ts
type LoggerFactory = (componentId: ComponentId) => Logger;
```

Provided on `ApplicationDefinition`:

```ts
type ApplicationDefinition<TComponents extends readonly AnyComponent[]> = {
    readonly components: TComponents;
    readonly logger?: LoggerFactory;
};
```

### Context extension

```ts
type ComponentContext<TUses, TState> = {
    call(...): ...;
    readonly log: Logger;
} & (state conditional);
```

`AnyComponentContext` also gains `readonly log: Logger`.

### Default console logger

```ts
function consoleLoggerFactory(componentId: ComponentId): Logger;
```

Prefixes each log line with `[componentId]`. Maps `debug` → `console.debug`, `info` → `console.info`, `warn` → `console.warn`, `error` → `console.error`.

## Implementation Plan

### New file: `src/component/logger.ts`

- `Logger` type.
- `LoggerFactory` type.
- `consoleLoggerFactory` function.

### Type changes (`component/component.ts`)

- Add `readonly log: Logger` to `BaseComponentContext`.
- Add `readonly log: Logger` to `AnyComponentContext`.

### Type changes (`application/application.ts`)

- Add optional `logger?: LoggerFactory` to `ApplicationDefinition`.
- In `createApplication`, resolve the factory (default to `consoleLoggerFactory`), call it per component, and include the result in each component's context.

### Tests

- Default logger: handlers and lifecycle hooks receive a `log` property with all four methods.
- Custom logger factory: the factory is called with each component's id, and handlers receive the returned logger.
- Logger is pre-scoped: verify the factory receives the correct component id.

## Out of Scope

- Structured log transport, log shipping, or deployment-specific logging.
- Log level filtering.
- Gateway-specific logging behavior.
- Configuration loading for logger setup.
