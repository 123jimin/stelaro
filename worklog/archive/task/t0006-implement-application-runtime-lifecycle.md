+++
id = "t0006"
title = "Implement application runtime lifecycle"
status = "done"
tags = ["application", "lifecycle"]
modifies = ["s0001", "s0002", "s0003", "s0004"]
blocked_by = []
+++

## Scope

- Define and implement minimal application runtime lifecycle in the core package.
- Add `start()` and `stop()` methods to the `Application` runtime returned by `createApplication`.
- Add optional `start` and `stop` lifecycle hooks to component definitions via `defineComponent`.
- `app.start()` calls each registered component's `start` hook (if present), in dependency order (see Q3).
- `app.stop()` calls each registered component's `stop` hook (if present), in reverse dependency order (see Q3).
- Lifecycle hooks receive the component's context (same context as call handlers — `call`, and `state` if stateful).
- `app.start()` and `app.stop()` are async and return a promise that resolves when all hooks complete.
- Start failure: no rollback. Application transitions to `"failed"`, user calls `stop()` to clean up.
- Stop failure: best-effort, rejects with `AggregateError` if any hooks threw.
- Components without lifecycle hooks are silently skipped during start/stop.
- `app.call()` requires the application to be in the `"active"` state (see Q5).
- Update s0001, s0002, s0003, s0004 with approved lifecycle behavior.

## Design Questions

These must be answered (by explicit user approval) before spec updates begin.

### Q1: Lifecycle hook shape — APPROVED

Optional `start` and `stop` functions on the component definition.

```ts
defineComponent({
    calls: SomeCalls,
    uses: [],
    state: () => ({connected: false}),
    start({state}) {
        state.connected = true;
    },
    stop({state}) {
        state.connected = false;
    },
    handlers: { ... },
});
```

Hooks are top-level on the definition, not nested in a `lifecycle` object. They receive the same context type as handlers.

### Q2: Application start/stop API — APPROVED

`app.start()` and `app.stop()` are async methods on the `Application` runtime.

```ts
const app = createApplication(definition);
await app.start();
// ... app is running ...
await app.stop();
```

### Q3: Ordering — APPROVED

Lifecycle order is derived from the `uses` dependency graph.

- **Start**: topological sort of the `uses` graph — dependencies start before dependents. Registration order as tiebreaker for unrelated components.
- **Stop**: reverse of start order — dependents stop before their dependencies.
- **Circular dependencies**: detected and rejected by `createApplication` (topological sort is impossible).

Example: if `PageComponent` uses `CounterCalls` and `CounterComponent` provides `CounterCalls`, then `CounterComponent` starts first and stops last.

This ensures a component's dependencies are running before its `start` hook is called, and a component has stopped before its dependencies begin shutting down.

### Q4: Error semantics — APPROVED

- **Start failure: no rollback.** `start()` rejects with the thrown error. Already-started components remain in their started state. The application transitions to `"failed"`. User is responsible for calling `stop()` to clean up.
- **Stop failure: AggregateError.** `stop()` runs all hooks (best-effort). If any throw, `stop()` rejects with an `AggregateError` containing all errors.

### Q5: Lifecycle state machine — APPROVED (revised)

States: `"idle"`, `"starting"`, `"stopping"`, `"active"`, `"failed"`.

Transitions:
- `idle` → `starting` (on `app.start()`)
- `starting` → `active` (all hooks succeeded)
- `starting` → `failed` (a hook threw)
- `active` → `stopping` (on `app.stop()`)
- `failed` → `stopping` (on `app.stop()`, to clean up)
- `stopping` → `idle` (stop complete, regardless of errors)

Guards:
- `app.call()` only valid in `active`. All other states throw `LifecycleStateError`.
- `app.start()` only valid in `idle`. All other states throw `LifecycleStateError`.
- `app.stop()` only valid in `active` or `failed`. All other states throw `LifecycleStateError`.

## Implementation Summary

### Type changes (`component.ts`)

- Add optional `start` and `stop` to `Component<TCalls, TUses, TState>` — both are `(context: ComponentContext<TUses, TState>) => Promisable<void>`.
- Mirror on `AnyComponent`: `start?(context: AnyComponentContext): Promisable<void>` and same for `stop`.

### Type changes (`application.ts`)

- Extend the `Application<TComponents>` type with `start(): Promise<void>` and `stop(): Promise<void>`.
- Add a `LifecycleState` string union: `"idle" | "starting" | "stopping" | "active" | "failed"`.

### Runtime changes (`application.ts` — `createApplication`)

- Track `lifecycle_state: LifecycleState`, initially `"idle"`.
- Build a topological order of `definition.components` from their `uses` graph:
  - Map each component to the set of call surface ids it depends on.
  - Kahn's algorithm (BFS) over the dependency edges.
  - If the sort does not consume all components, throw `CircularDependencyError`.
- `app.start()`:
  - Guard: throw `LifecycleStateError` if not `"idle"`.
  - Set state to `"starting"`.
  - Walk the topological order. For each component that has a `start` hook, call `component.start(context)`.
  - On success: set state to `"active"`.
  - On failure: set state to `"failed"`, reject with the thrown error. No rollback.
- `app.stop()`:
  - Guard: throw `LifecycleStateError` if not `"active"` or `"failed"`.
  - Set state to `"stopping"`.
  - Walk the reverse topological order. For each component that has a `stop` hook, call it (best-effort — continue on error).
  - Set state to `"idle"`.
  - If any hooks threw, reject with `AggregateError` containing all errors.
- `app.call()`:
  - Guard: throw `LifecycleStateError` if state is not `"active"`.

### Error classes (`error.ts`)

- `CircularDependencyError` — already stubbed, flesh out with the cycle path.
- `LifecycleStateError` — already stubbed, flesh out with current state and attempted operation.

### Spec updates

- s0001: add lifecycle to the high-level architecture overview.
- s0002: document `start`/`stop` on `Application`, lifecycle state machine, call guard.
- s0003: document optional `start`/`stop` hooks on component definitions.
- s0004: note that state is available in lifecycle hooks (same context).

### Tests

- Topological ordering: components start in dependency order, stop in reverse.
- Circular dependency detection at `createApplication` time.
- Lifecycle guards: `call` before `start`, `call` after `stop`, double `start`, `stop` before `start`.
- Start/stop hooks receive correct context (including `state` for stateful components).
- Components without lifecycle hooks are silently skipped.
- Start failure: no rollback, state transitions to `"failed"`, `stop()` still callable.
- Stop failure: all hooks run, rejects with `AggregateError`.
- Lifecycle state transitions: `idle` → `starting` → `active`/`failed`, `active`/`failed` → `stopping` → `idle`.

## Out of Scope

- Fastify-specific or Discord-specific runtime implementation.
- Gateway-specific binding behavior (gateway packages use the generic lifecycle hooks).
- Component-scoped logging behavior.
- Configuration loading and validation behavior.
- Hot Module Replacement behavior.
- Deployment or process supervision behavior.
