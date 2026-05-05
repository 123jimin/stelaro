+++
id = "t0018"
title = "Reimplement application runtime"
status = "pending"
tags = ["application", "architecture", "lifecycle", "config", "logging"]
modifies = ["s0002"]
blocked_by = []
+++

## Summary

`createApplication` in `packages/peranto/src/application/application.ts` needs to be rewritten from the ground up. The problems below are stated relative to the specs (s0002, s0003, s0004, s0008), not the current code structure.

## Spec divergences

- Code includes `argv` in `ApplicationOptions` and `args` on `Application` — CLI parsing has been removed from s0002. The code still imports `parseArgs` and exposes `ParsedArgs`.

## Structural problems

- The entire function is a single 160-line closure with 7 mutable captures and no intermediate structure. Validation, runtime construction, config loading, dispatch, lifecycle, and reload are all interleaved in one scope.
- Config loading (TOML, filesystem paths, `join`/`resolve`) is hardwired into `createApplication`. s0002 says "Configuration loading may be specified separately" — the current code makes this impossible.

## Missing: component lifetime

The application tracks its own lifecycle but has no concept of individual component lifetime.

- No tracking of which components actually started. If component B's `start` throws after A started successfully, the application has no record that A is alive and B isn't. `context_slot.value != null` is a proxy for "context was built" (during config loading, before start hooks), not "start hook succeeded."
- No state reinitialization across stop/start cycles. State is created once in `createApplication`. After `stop()` → `start()`, the second run inherits dirty state from the first.
- No per-component lifecycle state. A component that successfully started is indistinguishable from one that was never started or one that failed. Proper component lifetime would track each component's state: created → started → stopped.

This is why `stop` after partial-start failure is broken — it doesn't know what to clean up.

## Correctness problems

- `context_slot` starts `null` and is populated later during config loading. Every use site does `runtime.context_slot.value!`. This indirection exists only because config loading was interleaved with construction.
- Stateless components get `state: null`. The spec says they should not have state at all — `null` is not the same as absent.
- `reloadComponentConfig` throws `ConfigValidationError` for non-validation errors (component not registered, no schema declared). These are programmer errors, not config validation failures.

## Type problems

- `buildContext` constructs context as `Record<string, unknown>` with manual string-keyed insertion, then casts to `AnyComponentContext`. All type information is discarded.
- `dispatch` is generic over `TCall` but the dispatchers map stores `(input: unknown) => Promisable<unknown>`. The generic is a fiction — type safety relies on `as` casts, not the generic parameter.
- `app_config` is a mutable `let` exposed via `Object.defineProperty` getter hacked onto the return object. Invisible to static analysis.

## Validation gaps

- No validation that component ids are unique. Two components with the same id but different call names silently collide in `id_to_runtime`, logging, and config file paths.
- `validateAndSortComponents` uses reference-identity `Set<AnyComponentCalls>` for dependency checking. This is the intended mechanism but is an implicit invariant — not enforced or documented anywhere.

## Test changes required

### `application.spec.ts`

- **Wrong assertion:** "transitions to failed on start hook error without rolling back" asserts both A and B are stopped after B's start throws. Per s0002, only active components should be stopped — B's start threw, so B should not get a stop call.
- **Remove:** "exposes parsed CLI arguments on the application runtime" and "exposes undefined args when no CLI arguments are provided" — CLI parsing is no longer part of application creation (removed from s0002).
- **Missing:** `DuplicateComponentIdError` — two components with the same id but different call surfaces.
- **Missing:** Component lifetime tracking — after partial-start failure, only successfully-started components get stop hooks called.
### `config.spec.ts`

- **Wrong error type:** "throws ConfigValidationError when reloadComponentConfig targets a component without config schema" expects `ConfigValidationError`, but this is a programmer error (no schema declared), not a config validation failure. Needs a distinct error type.

### `error.spec.ts`

- **Missing:** `DuplicateComponentIdError` error class test.
