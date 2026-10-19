+++
id = "s0007"
title = "Errors"
tags = ["errors", "application", "component"]
paths = ["packages/stelaro/src/error.ts", "packages/stelaro/src/application/error.ts", "packages/stelaro/src/application/lifecycle.ts", "packages/stelaro/src/config/error.ts"]
+++

## Behavior

- `StelaroError` is an abstract `Error` subclass. Every core error extends it,
  identifies one failure condition, and carries relevant readonly structured
  properties alongside a human-readable message.
- Application errors are:
  - `DuplicateComponentIdError`: duplicate registered component id.
  - `MissingDependencyError`: a `uses` surface is not registered.
  - `MissingHandlerError`: a declared call has no handler.
  - `DuplicateCallError`: duplicate component call id, across registered components or within call surfaces being merged.
  - `UnregisteredCallError`: dispatch, or a `uses` entry, targets an unregistered call.
  - `UnregisteredComponentError`: an operation targets an unregistered
    component.
  - `UndeclaredCallError`: a handler calls a reference absent from `uses`.
  - `CallInputError`: a call's input fails its schema before the handler runs.
  - `CircularDependencyError`: the `uses` graph contains a cycle.
  - `LifecycleStateError`: an operation is invalid in the current lifecycle
    state.
- `InvalidComponentIdError` reports a component id that is not lowercase
  kebab-case.
- `MismatchedComponentIdError` reports call surfaces of different components passed to `mergeComponentCalls`.
- `UserFacingError.user_message` is safe to show to an end user; each gateway
  decides its presentation.
- `ConfigFileError` and `SecretsFileError` report unreadable files.
  `ConfigValidationError` and `SecretsValidationError` report schema failures.
- Call output failures propagate as arktype errors unchanged. `CallInputError`
  wraps a call input failure as its `cause` so a transport can tell a caller's
  bad input from a handler's bad output.

## Constraints

- Core error class names MUST end in `Error`, be exported from core, and MUST
  NOT depend on gateway packages.
- Structured error properties MUST be readonly.

## Anticipated Changes

- Gateways may define `StelaroError` subclasses. Further lifecycle,
  configuration, and HMR behavior may add errors.
