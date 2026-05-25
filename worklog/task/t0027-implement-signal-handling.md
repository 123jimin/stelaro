+++
id = "t0027"
title = "Implement signal handling utility"
status = "pending"
tags = ["application", "lifecycle", "util"]
modifies = ["s0020"]
blocked_by = []
+++

## Scope

Implement `attachSignalHandlers` in `packages/stelaro/src/signal/signal.ts`. Re-export from `packages/stelaro/src/signal/index.ts` and from the package root index.

### Types

```ts
type SignalHandlerOptions = {
    timeout?: number | null;  // ms; default 10_000; null disables
    logger?: Logger;          // overrides app.logger if provided
};

function attachSignalHandlers(
    app: { stop(): Promise<void>; logger?: LoggerFactory },
    options?: SignalHandlerOptions,
): () => void;
```

The first parameter is structural rather than the generic `Application` type — avoids requiring three type parameters at the call site. The optional `logger` property means the full `Application` (which always has `logger`) works directly, but a bare `{ stop() }` also works.

### Behavior

- **SIGINT / SIGTERM**: Calls `app.stop()`. Sets a `stopping` flag. Repeated signals while `stopping` is true are ignored.
- **Timeout**: If `app.stop()` does not resolve within `timeout` ms, calls `process.exit(1)`. Timer is `.unref()`'d so it does not keep the event loop alive on its own.
- **Exit**: `app.stop()` resolves → `process.exit(0)`. `app.stop()` rejects → `process.exit(1)`.
- **Cleanup**: The returned function calls `process.off` for both SIGINT and SIGTERM handlers and clears any pending timeout.

### Logging

Logger resolution: `options.logger` → `app.logger("signal")` → `consoleLoggerFactory("signal")`.

- `info`: Signal received, beginning shutdown.
- `error`: Shutdown timed out after `{timeout}ms`.

### Files

- `packages/stelaro/src/signal/signal.ts` — implementation
- `packages/stelaro/src/signal/index.ts` — re-export
- `packages/stelaro/src/index.ts` — add `export * from "./signal/index.ts"`

## Out of Scope

- Automatic attachment during `app.start()`.
- Custom signal sets beyond SIGINT/SIGTERM.
- Windows-specific signal quirks (SIGINT via Ctrl+C works; SIGTERM is not raised by Windows natively — no special handling).
