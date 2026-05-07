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

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `call` accepts only references from registered components' call surfaces, with input/output types inferred from the reference.

```typescript
type LifecycleState = "idle" | "starting" | "active" | "reloading" | "failed" | "stopping";

type ApplicationDefinition = {
    readonly components: readonly AnyComponent[];
    readonly logger?: LoggerFactory;        // default: consoleLoggerFactory
    readonly config?: ConfigSchema;
    readonly onConfigReload?: () => Promisable<void>;
};

type ApplicationOptions = {
    readonly base_dir?: string;
};

type Application = {
    readonly config: unknown;               // null when definition has no config schema
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

## Constraints

- Application runtime state initialization must happen during `createApplication`, before any calls are dispatched.

## Anticipated Changes

- Gateway registration may be specified separately.

## Dangers

- Mixing reusable definition concerns with runtime state can make the public model confusing.
