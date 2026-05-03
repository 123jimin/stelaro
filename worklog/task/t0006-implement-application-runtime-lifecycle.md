+++
id = "t0006"
title = "Implement application runtime lifecycle"
status = "active"
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
- Start/stop error semantics are pending approval (see Q4).
- Components without lifecycle hooks are silently skipped during start/stop.
- `app.call()` requires the application to be in the `started` state (see Q5).
- Update s0001, s0002, s0003, s0004 with approved lifecycle behavior.

## Design Questions

These must be answered (by explicit user approval) before spec updates begin.

### Q1: Lifecycle hook shape

**Proposed:** Optional `start` and `stop` functions on the component definition.

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

### Q2: Application start/stop API

**Proposed:** `app.start()` and `app.stop()` are async methods on the `Application` runtime.

```ts
const app = createApplication(definition);
await app.start();
// ... app is running ...
await app.stop();
```

### Q3: Ordering

**Proposed:** Lifecycle order is derived from the `uses` dependency graph.

- **Start**: topological sort of the `uses` graph — dependencies start before dependents. Registration order as tiebreaker for unrelated components.
- **Stop**: reverse of start order — dependents stop before their dependencies.
- **Circular dependencies**: detected and rejected by `createApplication` (topological sort is impossible).

Example: if `PageComponent` uses `CounterCalls` and `CounterComponent` provides `CounterCalls`, then `CounterComponent` starts first and stops last.

This ensures a component's dependencies are running before its `start` hook is called, and a component has stopped before its dependencies begin shutting down.

### Q4: Error semantics

Needs decision on two axes: start failure behavior and stop failure behavior.

**Start failure — what happens when a component's `start` hook throws?**

All options fail fast (don't call remaining hooks). The question is what to do about components that already started successfully.

- **A. No rollback.** `start()` rejects. Already-started components remain in their started state. User must call `stop()` to clean up. Simple, explicit, no surprises.
- **B. Automatic rollback.** `start()` calls `stop()` on already-started components (in reverse order) before rejecting. Convenient, but adds implicit behavior — if a rollback stop hook also throws, there are now two error sources.
- **C. Automatic rollback with AggregateError.** Same as B, but if rollback stop hooks also throw, `start()` rejects with an `AggregateError` containing the original start error and all rollback errors.

**Stop failure — what happens when a component's `stop` hook throws?**

All options run all hooks (best-effort cleanup). The question is how to report errors.

- **A. First error wins.** `stop()` rejects with the first error thrown. Other errors are silently lost.
- **B. AggregateError.** `stop()` rejects with an `AggregateError` containing all errors. Nothing is lost, caller can inspect all failures.

### Q5: Calls require lifecycle — APPROVED (revised)

`app.call()` throws if the application has not been started. The application tracks its lifecycle state:

- `created` → `app.start()` → `started` → `app.stop()` → `stopped`
- `app.call()` only works in the `started` state.
- `app.call()` before `start()` throws (application not started).
- `app.call()` after `stop()` throws (application stopped).
- `app.start()` when already started throws (already running).
- `app.stop()` when not started throws (not running).

## Out of Scope

- Fastify-specific or Discord-specific runtime implementation.
- Gateway-specific binding behavior (gateway packages use the generic lifecycle hooks).
- Component-scoped logging behavior.
- Configuration loading and validation behavior.
- Hot Module Replacement behavior.
- Deployment or process supervision behavior.
