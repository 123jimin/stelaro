import type {Nullable} from "@jiminp/tooltool";

import {consoleLoggerFactory, type Logger, type LoggerFactory} from "../component/logger.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Options for {@link attachSignalHandlers}.
 *
 * @category Signal
 */
export type SignalHandlerOptions = {
    /** Maximum time in ms to wait for graceful shutdown before exiting with code 1, or `null` to wait indefinitely (default: `10000`) */
    readonly timeout?: number | null | undefined;
    /** Logger for shutdown messages (default: application's `signal` logger or console) */
    readonly logger?: Nullable<Logger>;
};

/**
 * Registers `SIGINT` and `SIGTERM` handlers that gracefully stop the application.
 *
 * The first signal stops the application and exits with code 0 on success or
 * code 1 on failure or timeout; later signals are ignored.
 *
 * @param app - Application to stop
 * @param options - Signal handling options
 * @returns A cleanup function that removes this attachment's listeners and clears any pending timeout
 * @throws {RangeError} If `timeout` is neither `null` nor a finite number from 0 to 2147483647
 * @category Signal
 */
export function attachSignalHandlers(
    app: {stop(): Promise<void>; logger?: LoggerFactory},
    options?: SignalHandlerOptions,
): () => void {
    const timeout = options?.timeout === null ? null : (options?.timeout ?? DEFAULT_TIMEOUT_MS);
    if(timeout != null && !(Number.isFinite(timeout) && timeout >= 0 && timeout <= MAX_TIMEOUT_MS)) {
        throw new RangeError(`Signal handler timeout must be null or a finite number from 0 to ${MAX_TIMEOUT_MS}; got ${timeout}.`);
    }

    const log = options?.logger
        ?? app.logger?.("signal")
        ?? consoleLoggerFactory("signal");
    let stopping = false;
    let timeout_id: ReturnType<typeof setTimeout> | null = null;

    function onSignal() {
        if(stopping) return;
        stopping = true;

        log.info("Received shutdown signal, stopping application.");

        if(timeout != null) {
            timeout_id = setTimeout(() => {
                log.error(`Shutdown timed out after ${timeout}ms.`);
                process.exit(1);
            }, timeout);
        }

        app.stop().then(
            () => {
                if(timeout_id != null) clearTimeout(timeout_id);
                process.exit(0);
            },
            (error: unknown) => {
                if(timeout_id != null) clearTimeout(timeout_id);
                log.error({err: error}, "Shutdown failed.");
                process.exit(1);
            },
        );
    }

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    return () => {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
        if(timeout_id != null) {
            clearTimeout(timeout_id);
            timeout_id = null;
        }
    };
}
