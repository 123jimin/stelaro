+++
id = "t0014"
title = "Implement core error classes"
status = "done"
tags = ["errors", "application", "component"]
modifies = ["s0007"]
blocked_by = []
+++

## Scope

- Create `packages/stelaro/src/error.ts` with a base class and named error classes for every failure condition currently thrown as bare `Error` in the core package.
- Implement `StelaroError` as the abstract base class extending `Error`.
- Implement: `MissingDependencyError`, `MissingHandlerError`, `DuplicateCallError`, `UnregisteredCallError`, `UndeclaredCallError`. All extend `StelaroError`.
- Each error class carries structured readonly properties relevant to the failure and has a descriptive default message.
- Replace all `throw new Error(...)` in `application.ts` with the appropriate error class.
- Export all error classes from the core package entrypoint.
- Add `CircularDependencyError` and `LifecycleStateError` extending `StelaroError` (to be used by t0006 when lifecycle is implemented). Mark these UNIMPLEMENTED in s0007.
- Update existing tests to assert on error class identity (`assert.throws(..., MissingDependencyError)`) instead of message regex.
- Update s0007 to remove UNIMPLEMENTED markers for implemented errors.

## Out of Scope

- Gateway-specific error classes.
- Wrapping Arktype validation errors.
- Lifecycle implementation (t0006 uses the error classes; this task only defines them).
