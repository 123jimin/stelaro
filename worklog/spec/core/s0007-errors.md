+++
id = "s0007"
title = "Errors"
tags = ["errors", "application", "component"]
paths = ["packages/stelaro/src/error.ts", "packages/stelaro/src/application/error.ts", "packages/stelaro/src/application/lifecycle.ts", "packages/stelaro/src/config/error.ts"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0007.

## Behavior

- `StelaroError` is an abstract `Error` subclass. Every core error extends it,
  identifies one failure condition, and carries relevant readonly structured
  properties alongside a human-readable message.
- Application errors are:
  - `DuplicateComponentIdError`: duplicate registered component id.
  - `MissingDependencyError`: a `uses` surface is not registered.
  - `MissingHandlerError`: a declared call has no handler.
  - `DuplicateCallError`: duplicate registered component call id.
  - `UnregisteredCallError`: dispatch targets an unregistered call.
  - `UnregisteredComponentError`: an operation targets an unregistered
    component.
  - `UndeclaredCallError`: a handler calls a reference absent from `uses`.
  - `CircularDependencyError`: the `uses` graph contains a cycle.
  - `LifecycleStateError`: an operation is invalid in the current lifecycle
    state.
- `InvalidComponentIdError` reports a component id that is not lowercase
  kebab-case.
- `UserFacingError.user_message` is safe to show to an end user; each gateway
  decides its presentation.
- `ConfigFileError` and `SecretsFileError` report unreadable files.
  `ConfigValidationError` and `SecretsValidationError` report schema failures.
- Arktype validation errors propagate unchanged rather than being wrapped.

## Constraints

- Core error class names MUST end in `Error`, be exported from core, and MUST
  NOT depend on gateway packages.
- Structured error properties MUST be readonly.

## Anticipated Changes

- Gateways may define `StelaroError` subclasses. Further lifecycle,
  configuration, and HMR behavior may add errors.
