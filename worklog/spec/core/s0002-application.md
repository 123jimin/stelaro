+++
id = "s0002"
title = "Application"
tags = ["application", "architecture", "lifecycle", "config", "logging"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0003: Component
- s0004: Context
- s0006: Hot Module Replacement
- s0028: Logging

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `call` accepts only references from registered components' call surfaces, with input/output types inferred from the reference.

```typescript
type LifecycleState = "idle" | "starting" | "active" | "reloading" | "failed" | "stopping";

type ApplicationDefinition = {
    readonly components: readonly AnyComponent[];
    readonly logger?: LoggerFactory;        // default: consoleLoggerFactory
    readonly translator?: TranslatorFactory; // default: source translator; see s0026
    readonly config?: ConfigSchema;
    readonly secrets?: ConfigSchema;
    readonly onConfigReload?: () => Promisable<void>;
};

type ApplicationOptions = {
    readonly base_dir?: string;
    readonly env?: string | null;
};

type Application = {
    readonly config: unknown;               // null when definition has no config schema
    readonly secrets: unknown;              // null when definition has no secrets schema
    readonly logger: LoggerFactory;
    readonly translator: TranslatorFactory;
    start(): Promise<void>;
    stop(): Promise<void>;
    call(reference: AnyComponentCallReference, input: unknown): Promise<unknown>;
    reloadConfig(): Promise<void>;
    reloadComponentConfig(component_id: ComponentId): Promise<void>;
};

function defineApplication(definition: ApplicationDefinition): ApplicationDefinition;
function createApplication(definition: ApplicationDefinition, options?: ApplicationOptions): Application;
```

## Behavior

### Core

- `createApplication` validates that all component ids are unique.
- `createApplication` computes a topological ordering of components from the `uses` dependency graph.
- `createApplication` throws `CircularDependencyError` if the dependency graph contains a cycle.

### Lifecycle states

- `idle` — not running. Initial state after `createApplication`, and after `stop()` completes.
- `starting` — `start()` in progress; component start hooks executing in topological order.
- `active` — all start hooks completed. Calls, stop, and config reload are valid.
- `reloading` — config reload in progress. Calls still accepted.
- `failed` — a start hook or `onConfigReload` hook threw. Some components may be partially started. Only `stop()` is valid, to clean up.
- `stopping` — `stop()` in progress; component stop hooks executing in reverse order.

### Lifecycle transitions

- `app.start()` transitions `idle` → `starting` → `active`. Calls each component's `start` hook (if present) in topological dependency order.
- A component becomes active during start if it has no `start` hook (skipped), or if its `start` hook completes successfully.
- If a `start` hook throws, the application transitions to `failed`. Already-started components are not rolled back. The user must call `stop()` to clean up.
- `app.stop()` transitions `active | failed` → `stopping` → `idle`. Calls each active component's `stop` hook (if present) in reverse topological order (best-effort). Components that were never reached or whose `start` hook threw are not stopped.
- If any `stop` hooks throw, `stop()` rejects with an `AggregateError` containing all errors. The application still transitions to `idle`.
- `app.call()` only works in `active` or `reloading` states. All other states throw `LifecycleStateError`.
- `app.start()` only works in `idle`. All other states throw `LifecycleStateError`.
- `app.stop()` only works in `active` or `failed`. All other states throw `LifecycleStateError`.
- `app.reloadConfig()` only works in `active`. All other states throw `LifecycleStateError`.
- `app.reloadComponentConfig()` only works in `active`. All other states throw `LifecycleStateError`.

### Lifecycle logging

- The application logs each lifecycle transition through its logger factory: application-scoped transitions through a framework-scoped logger (scoped to the framework name), and each component's transitions through that component's scoped logger.
- Application start and stop transitions are logged at info; component start and stop transitions at debug. A transition accompanied by an error is logged at error, carrying the error.
- Config reloads (`reloadConfig`, `reloadComponentConfig`) log their application-scoped `active → reloading → active` transition at info; a single-component reload identifies the target component. Reload does not change component state and is not logged per component.
- Each record carries an `event` field naming the entered transition by lifecycle state (e.g. `app.starting`, `app.active`, `component.stopping`, `app.reloading`, `component.failed`); start and stop records also carry an elapsed-time field. Component identity is supplied by the scoped logger.
- The configured logger is used; with none provided, the default console logger applies. Verbosity follows the logger's level — there is no separate logging switch.

## Constraints

- Application runtime state initialization must happen during `createApplication`, before any calls are dispatched.

## Anticipated Changes

- Gateway registration may be specified separately.

## Dangers

- Mixing reusable definition concerns with runtime state can make the public model confusing.
