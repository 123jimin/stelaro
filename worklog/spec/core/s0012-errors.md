+++
id = "s0012"
title = "Errors"
tags = ["application", "component", "errors"]
paths = ["packages/stelaro/src/error.ts", "packages/stelaro/src/component/error.ts"]
+++

# Errors

## Shared contract

- `StelaroError` is an abstract `Error` subclass.
  - Every core error class extends it, identifies one failure condition, and carries relevant readonly structured properties and a human-readable message.
- Core error class names MUST end in `Error`.
  - Core MUST export them and MUST NOT depend on gateway packages for them.
- The operation specs define subclasses of `StelaroError` when errors occur.

## Errors for component authors

- `ComponentNotReadyError` reports that a component cannot serve a call because its state is not ready.
  - Its constructor takes the `component_id`, which the error exposes as a readonly property.
  - Lifecycle state check during call transport is expected to prevent those cases, so core never throws it.
  - Component handlers may throw it as part of defensive programming.
- `UserFacingError.user_message` is safe to show to an end user.
  - Its constructor takes the user message and optional `ErrorOptions`.
  - Its optional `cause` may carry an internal failure and SHOULD stay private.
