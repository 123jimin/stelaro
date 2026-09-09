+++
id = "s0020"
title = "Signal Handling"
tags = ["application", "lifecycle", "util"]
paths = ["packages/stelaro/src/signal/**"]
+++

## Related Specs

- s0002: Application (lifecycle, `stop()`)

## Behavior

### Overview

- Signal handling is an opt-in utility that wires OS termination signals to `app.stop()`.
- Signal handling is not automatic — applications must explicitly attach it.

### Attachment

- `attachSignalHandlers` accepts an application and returns a cleanup function that detaches the handlers.
- `attachSignalHandlers` accepts an optional options object for configuring timeout and logging behavior.
- `attachSignalHandlers` may be called at any point. Signal handlers registered before the application is active will call `stop()` when a signal arrives; if the application is not in a stoppable state, `stop()` rejects with `LifecycleStateError` and the process exits with code 1.

### Signal Response

- On SIGINT or SIGTERM, the utility calls `app.stop()`.
- Repeated signals while `app.stop()` is in progress are ignored.

### Timeout

- If `app.stop()` does not resolve within a configurable timeout, the process exits with code 1.
- The default timeout is 10 seconds.
- Timeout may be disabled by setting it to `null`.

### Cleanup

- Calling the returned cleanup function removes all signal listeners registered by `attachSignalHandlers`.
- After cleanup, signals revert to their default Node.js behavior.

### Exit Behavior

- After `app.stop()` resolves successfully, the process exits with code 0.
- After `app.stop()` rejects, the process exits with code 1.

### Logging

- The utility logs at the `info` level when a signal is received and shutdown begins.
- The utility logs at the `error` level on timeout.
- When the application exposes a `logger` factory (the `Application` type does), the utility constructs a `"signal"`-scoped logger from it.
- The logger may be overridden via the options object.
- When neither the application nor options provide a logger, the utility falls back to the default console logger scoped to `"signal"`.

## Constraints

- Signal handling must not be coupled to the application lifecycle automatically — it is always opt-in.
- Signal handling must not interfere with the application's own error handling in `stop()`.
- The utility must be safe to call in environments where signals are not available (no-op or error, not crash).

## Anticipated Changes

- Custom signal sets beyond SIGINT/SIGTERM may be configurable later.
- Integration with the logger factory may change if application-level logging is refactored.

## Dangers

- Automatic signal handling would surprise applications that manage their own process lifecycle.
- Swallowing `stop()` errors during shutdown could hide bugs in component cleanup.
- Unbounded shutdown without a timeout default would leave zombie processes in production.
