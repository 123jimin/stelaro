+++
id = "t0007"
title = "Implement component-scoped logging"
status = "done"
tags = ["logging", "component", "context", "application"]
modifies = ["s0001", "s0002", "s0003", "s0004"]
blocked_by = []
+++

## Scope

- Define a `Logger` interface with `debug`, `info`, `warn`, `error` methods.
- Each method accepts arbitrary log arguments.
- Add `log: Logger` to `ComponentContext`. Handlers and lifecycle hooks receive a logger pre-scoped to the component id.
- `ApplicationDefinition` accepts an optional `logger` factory: `(componentId: ComponentId) => Logger`.
- `createApplication` calls the factory per component to produce scoped loggers, then wires them into each component's context.
- Core ships a default `console`-based logger factory (`consoleLoggerFactory`) that prefixes output with the component id.
- When no `logger` factory is provided, the default console logger is used.
- Export logger types and the default logger factory through the component package and core package root.
- Update affected specs (s0001, s0002, s0003, s0004) to remove only implemented logging `UNIMPLEMENTED` markers. Leave configuration markers intact.

## Design Decisions

### Logger interface

```ts
type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
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

### Exports

- Export logger types and `consoleLoggerFactory` from `src/component/index.ts`.
- Ensure the logger exports are reachable from the core package root.

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
- Default console logger behavior: temporarily replace `console.debug`, `console.info`, `console.warn`, and `console.error` with spies, call each matching `context.log` method from component behavior, then restore the console methods in a `finally` block. Assert that each console method is called through the matching log method, that the first string argument starts with `[componentId]`, and that the log arguments are preserved after the component id prefix.

## Implementation Summary

- Added core `Logger` and `LoggerFactory` types.
- Added the default component-scoped console logger factory.
- Added `log` to component handler and lifecycle hook context.
- Added application-level logger factory support with the console logger as the default.
- Exported logger types and the default logger factory from the component package and core package root.
- Updated affected specs to mark implemented logging behavior as built while preserving configuration `UNIMPLEMENTED` markers.

## Verification

- `pnpm --filter @jiminp/peranto test`
- `pnpm --filter @jiminp/peranto lint`
- `worklog validate.py`

## Out of Scope

- Structured log transport, log shipping, or deployment-specific logging.
- Log level filtering.
- Gateway-specific logging behavior.
- Configuration loading for logger setup.
