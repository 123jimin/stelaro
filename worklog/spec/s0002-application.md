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

## High-Level API

- `defineApplication({ components })` — declares a reusable application definition separately from runtime creation.
- `createApplication(definition)` — creates a runtime application from a definition. Validates components, initializes state, and computes lifecycle ordering.
- `app.start()` — starts the application (calls component `start` hooks in dependency order).
- `app.stop()` — stops the application (calls component `stop` hooks in reverse dependency order).
- `app.call(reference, input)` — dispatches a typed component call. Only valid when the application is `active`.

## Behavior

### Core

- An application coordinates registered components.
- An application coordinates typed component calls.
- UNIMPLEMENTED An application coordinates configuration.
- UNIMPLEMENTED An application coordinates logging.
- Application definitions can be declared separately from creating the application runtime.
- Applications are created with `createApplication`.
- `createApplication` initializes state for each registered component that declares a state factory.
- `createApplication` computes a topological ordering of components from the `uses` dependency graph.
- `createApplication` throws `CircularDependencyError` if the dependency graph contains a cycle.
- UNIMPLEMENTED Application definitions may provide a logger factory used to create component-scoped loggers.
- UNIMPLEMENTED When no logger factory is provided, application creation uses the default console logger factory.
- UNIMPLEMENTED The application creates one logger per component and provides that logger through the component's context.

### Lifecycle

- The application tracks a lifecycle state: `idle`, `starting`, `active`, `failed`, `stopping`.
- `app.start()` transitions from `idle` → `starting` → `active`. Calls each component's `start` hook (if present) in topological dependency order.
- If a `start` hook throws, the application transitions to `failed`. Already-started components are not rolled back. The user must call `stop()` to clean up.
- `app.stop()` transitions from `active` or `failed` → `stopping` → `idle`. Calls each component's `stop` hook (if present) in reverse topological order (best-effort).
- If any `stop` hooks throw, `stop()` rejects with an `AggregateError` containing all errors. The application still transitions to `idle`.
- `app.call()` only works in the `active` state. All other states throw `LifecycleStateError`.
- `app.start()` only works in `idle`. All other states throw `LifecycleStateError`.
- `app.stop()` only works in `active` or `failed`. All other states throw `LifecycleStateError`.
- Components without lifecycle hooks are silently skipped during start/stop.

## Constraints

- Application behavior belongs to the core package.
- Application behavior must not depend on gateway-specific runtimes.
- Shared concerns stay with the application: lifecycle, configuration, logging, component registration, and typed calls.
- Application runtime state initialization must happen during `createApplication`, before any calls are dispatched.

## Anticipated Changes

- Gateway registration may be specified separately.
- Configuration loading may be specified separately.

## Dangers

- Mixing application behavior with gateway-specific routing can make the core package depend on external runtime protocols.
- Mixing reusable definition concerns with runtime state can make the public model confusing.
