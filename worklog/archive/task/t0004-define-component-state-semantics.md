+++
id = "t0004"
title = "Define component state semantics"
status = "done"
tags = ["component", "context", "application"]
modifies = ["s0001", "s0002", "s0003", "s0004", "s0010"]
blocked_by = []
+++

## Scope

- Define the approved behavior for component-local state.
- Specify how component state is declared, initialized, and made available to component behavior.
- Specify whether component state is scoped to an application runtime, a component definition, a request, or another boundary.
- Specify whether repeated calls within one application runtime observe shared mutable state.
- Align the web server counter example with the approved state semantics.
- Update affected specs with approved behavior, leaving `UNIMPLEMENTED` markers where behavior is specified but not implemented.

## Out of Scope

- Implementing runtime state storage unless explicitly approved when this task becomes active.
- State persistence across process restarts.
- State reset APIs.
- State preservation during Hot Module Replacement.
- Cross-process or distributed state behavior.
- Component lifecycle, logging, and configuration behavior beyond what is required to describe state boundaries.

## Design Questions (all approved 2026-05-02)

### Q1: State declaration — APPROVED

A component declares state with an optional `state` factory function in `defineComponent`. The factory returns the initial state object. Components that omit `state` have no state.

### Q2: State initialization timing — APPROVED

The state factory executes once per component during `createApplication`. Each component's state is created when the application runtime is constructed. A single `defineComponent` value reused across multiple `createApplication` calls gets independent state per application runtime.

### Q3: State scope — APPROVED

State is scoped to one component within one application runtime. All calls to the same component within the same application runtime observe the same state object. There is no per-request, per-session, or per-call state at the component state level.

**Clarification:** Per-request and per-session state will be represented through Context (s0004), not component state.

### Q4: Mutability model — APPROVED

State is a plain mutable JavaScript object. Handlers mutate it directly. No immutable-update ceremony, no setter API, no proxy. The state object returned by the factory is the same object reference throughout the lifetime of the application runtime.

**Clarification:** Peranto component state is explicitly not a persistent state model (contrast: React). State is ephemeral to the application runtime.

### Q5: State injection into context — APPROVED

Stateful components receive `state` as a property of their handler context object, alongside `call`. Typed as the return type of the component's state factory. Stateless components do not receive `state` in context.

### Q6: Concurrency — APPROVED

No built-in concurrency protection. Single-threaded Node.js event loop prevents true data races. Interleaving across await points is the component author's responsibility.

## Affected Specs — Planned Changes

Changes below are pending user approval of the design questions above.

### s0003 (Component)

Add to Behavior:
- Components may declare an optional state factory that returns the component's initial state.
- Components that declare a state factory receive their state object through handler context.
- Components that do not declare a state factory have no state and do not receive state in context.

Add to Constraints:
- Component state must be scoped to a single application runtime. A component definition reused across multiple application runtimes must have independent state per runtime.
- Component state must not be shared between different components within the same application runtime.

Add to Anticipated Changes:
- State preservation across Hot Module Replacement may be specified separately.
- State concurrency helpers may be specified separately.

### s0002 (Application)

Add to Behavior:
- `createApplication` initializes state for each registered component that declares a state factory.

Add to Constraints:
- Application runtime state initialization must happen during `createApplication`, before any calls are dispatched.

### s0004 (Context)

Add to Behavior:
- Context includes access to component state for components that declare a state factory.

Add to Constraints:
- Context must provide the same state object reference to all handler invocations of a given component within one application runtime.
- Context must not provide state to components that did not declare a state factory.

### s0001 (High-Level Architecture)

Add to Behavior:
- Components may declare local state that is created per application runtime and accessible through handler context.

### s0005 (Examples)

Add to Behavior:
- The web server counter example declares component state with a state factory on the counter component.
- The web server counter example accesses state through handler context.

Verify existing behavior items remain consistent (shared counter, in-memory, all-users-shared — already specified).

## Checklist

1. [x] Get user approval on Q1–Q6. (Approved 2026-05-02)
2. [x] Update s0003, s0002, s0004, s0001, s0005 with approved behavior (UNIMPLEMENTED markers).
3. [x] Verify web server example already aligns with approved semantics — example already uses `state: () => ({count: 0})` and destructures `{state}` in handlers. No changes needed.
4. [x] Run `validate.py` to check worklog consistency. Passed.
5. [x] Implement state: extended `Component` type with optional `state` factory, parameterized `ComponentContext` with state type, `createApplication` calls factories and injects state into context.
6. [x] Tests: 4 new tests (state init + mutation, independent state per runtime, no state for stateless, no cross-component sharing) + type-level assertions. All 12 tests pass.
7. [x] Removed UNIMPLEMENTED markers from implemented state behavior in s0001, s0002, s0003, s0004.

## Implementation Notes

- `Component<TCalls, TUses, TState>` gains a third type parameter (default `undefined`).
- `ComponentContext<TUses, TState>` uses a non-distributive conditional type: `[TState] extends [undefined]` omits `state`, otherwise adds `readonly state: TState`.
- `Component` uses an intersection with a non-distributive conditional to require `state` factory only when `TState` is not `undefined`.
- `AnyComponent` is a standalone interface with `state?: StateFactory<unknown>` — no `any`, no parameterized alias.
- `AnyComponentContext` is an erased context type with `call(...)` and `readonly state?: unknown`, reflecting that state may or may not be present.
- `createApplication` accesses `component.state` directly through `AnyComponent` (no type assertion) and constructs context via conditional spread.
- Stateless components get a context with no `state` property (verified by runtime test and type-level assertions).
- Type-level tests verify: `AnyComponentContext` has `state` as a known property, both stateful and stateless `ComponentContext` are assignable to `AnyComponentContext`, both stateful and stateless components are assignable to `AnyComponent`, state type is narrowed to factory return type, state is mutable.

## Notes

- The web server example already sketches a `state` capability on a component.
- `t0003` intentionally left component state behavior out of the core runtime.
