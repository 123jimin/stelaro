import {consoleLoggerFactory, type Logger, type LoggerFactory} from "../component/logger.ts";

/**
 * Options for {@link attachSignalHandlers}.
 *
 * @category Signal
 */
export type SignalHandlerOptions = {
    /** Maximum time in ms to wait for graceful shutdown before force-exiting (default: `10000`, `null` to disable) */
    readonly timeout?: number | null;
    /** Logger for shutdown messages (default: application's logger or console) */
    readonly logger?: Logger;
};

/**
 * Registers `SIGINT` and `SIGTERM` handlers that gracefully stop the application.
 *
 * @param app - Object with a `stop` method and optional logger factory
 * @param options - Signal handling options
 * @returns A detach function that removes the signal listeners and clears any pending timeout
 * @category Signal
 */
export function attachSignalHandlers(
    app: {stop(): Promise<void>; logger?: LoggerFactory},
    options?: SignalHandlerOptions,
): () => void {
    const log = options?.logger
        ?? app.logger?.("signal")
        ?? consoleLoggerFactory("signal");
    const timeout = options != null && "timeout" in options ? options.timeout : 10_000;
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
            timeout_id.unref();
        }

        app.stop()
            .then(() => {
                if(timeout_id != null) clearTimeout(timeout_id);
                process.exit(0);
            })
            .catch(() => {
                if(timeout_id != null) clearTimeout(timeout_id);
                process.exit(1);
            });
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
