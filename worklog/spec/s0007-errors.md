+++
id = "s0007"
title = "Errors"
tags = ["errors", "application", "component"]
paths = ["packages/peranto/src/error.ts"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0002: Application
- s0003: Component

## Behavior

- `PerantoError` is an abstract base class that extends `Error`. All peranto-core error classes extend `PerantoError`.
- Each error class identifies a distinct failure condition in the core package.
- Error classes carry structured properties relevant to the failure (component ids, call names, etc.) in addition to a human-readable message.

### Application errors

- `MissingDependencyError`: a component declares a `uses` call surface that is not registered in the application.
- `MissingHandlerError`: a component does not define a handler for one of its declared calls.
- `DuplicateCallError`: two or more components register the same component call id.
- `UnregisteredCallError`: a dispatch targets a component call that is not registered in the application.
- `UndeclaredCallError`: a component handler calls a reference it did not declare in `uses`.
- UNIMPLEMENTED `CircularDependencyError`: the component `uses` graph contains a cycle, making topological ordering impossible.
- UNIMPLEMENTED `LifecycleStateError`: an operation is attempted in an invalid lifecycle state (e.g. `call` before `start`, `start` when already started, `stop` when not started).

### Validation errors

- Arktype schema validation failures are thrown by Arktype itself and are not wrapped by Peranto error classes.

## Constraints

- All Peranto-core errors must extend `PerantoError`.
- `PerantoError` must extend `Error`.
- Error class names must end with `Error`.
- Error classes must be exported from the core package.
- Error classes must not depend on gateway-specific packages.
- Structured error properties must be readonly.

## Anticipated Changes

- Gateway packages may define their own error classes that extend `PerantoError`.
- Additional error classes may be added as lifecycle, configuration, and HMR behavior is specified.

## Dangers

- Wrapping third-party errors (like Arktype validation) would obscure the original failure and complicate debugging.
- Carrying mutable state in error properties would make error inspection unreliable.
