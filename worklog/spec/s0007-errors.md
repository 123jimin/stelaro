+++
id = "s0007"
title = "Errors"
tags = ["errors", "application", "component"]
paths = ["packages/stelaro/src/error.ts", "packages/stelaro/src/application/error.ts", "packages/stelaro/src/application/lifecycle.ts", "packages/stelaro/src/config/error.ts"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0002: Application
- s0003: Component

## Behavior

- `StelaroError` is an abstract base class that extends `Error`. All stelaro-core error classes extend `StelaroError`.
- Each error class identifies a distinct failure condition in the core package.
- Error classes carry structured properties relevant to the failure (component ids, call names, etc.) in addition to a human-readable message.

### Application errors

- `DuplicateComponentIdError`: two or more components are registered with the same component id.
- `MissingDependencyError`: a component declares a `uses` call surface that is not registered in the application.
- `MissingHandlerError`: a component does not define a handler for one of its declared calls.
- `DuplicateCallError`: two or more components register the same component call id.
- `UnregisteredCallError`: a dispatch targets a component call that is not registered in the application.
- `UnregisteredComponentError`: an operation targets a component id that is not registered in the application.
- `UndeclaredCallError`: a component handler calls a reference it did not declare in `uses`.
- `CircularDependencyError`: the component `uses` graph contains a cycle, making topological ordering impossible.
- `LifecycleStateError`: an operation is attempted in an invalid lifecycle state (e.g. `call` before `start`, `start` when already started, `stop` when not started).

### Component errors

- `InvalidComponentIdError`: a component id does not match the required lowercase kebab-case format.

### Configuration errors

- `ConfigFileError`: a config file could not be read from disk.
- `ConfigValidationError`: a config file's parsed contents failed schema validation.

### Validation errors

- Arktype schema validation failures are thrown by Arktype itself and are not wrapped by Stelaro error classes.

## Constraints

- All Stelaro-core errors must extend `StelaroError`.
- `StelaroError` must extend `Error`.
- Error class names must end with `Error`.
- Error classes must be exported from the core package.
- Error classes must not depend on gateway-specific packages.
- Structured error properties must be readonly.

## Anticipated Changes

- Gateway packages may define their own error classes that extend `StelaroError`.
- Additional error classes may be added as lifecycle, configuration, and HMR behavior is specified.

## Dangers

- Wrapping third-party errors (like Arktype validation) would obscure the original failure and complicate debugging.
- Carrying mutable state in error properties would make error inspection unreliable.
