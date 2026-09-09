+++
id = "s0020"
title = "Signal Handling"
tags = ["application", "lifecycle", "util"]
paths = ["packages/stelaro/src/signal/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0020.

## Behavior

- Signal handling is opt-in. `attachSignalHandlers(application, options?)`
  listens for `SIGINT` and `SIGTERM` and returns a cleanup function.
- On the first signal, it logs shutdown and calls `app.stop()`. Further signals
  are ignored while stopping.
- Successful shutdown exits with code 0. A rejected `stop()`, including
  `LifecycleStateError` when the app is not stoppable, exits with code 1.
- Shutdown exits with code 1 if `stop()` exceeds the configured timeout. The
  default is 10 seconds; `null` disables it.
- Cleanup removes only listeners installed by that attachment, after which
  Node's default signal behavior resumes.
- Logging uses an option-provided logger when present; otherwise it creates a
  `signal`-scoped logger from the application factory, falling back to the
  default `signal`-scoped console logger. Signal receipt is `info`; timeout is
  `error`.

## Constraints

- Signal handling MUST remain opt-in and MUST NOT replace the application's
  own `stop()` error handling.
- Attaching in an environment without signals MUST no-op or report an error,
  not crash.

## Anticipated Changes

- Custom signal sets and logger integration may be specified later.
