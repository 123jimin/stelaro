import {consoleLoggerFactory, type Logger, type LoggerFactory} from "../component/logger.ts";

/** @category Signal */
export type SignalHandlerOptions = {
    readonly timeout?: number | null;
    readonly logger?: Logger;
};

/** @category Signal */
export function attachSignalHandlers(
    app: {stop(): Promise<void>; logger?: LoggerFactory},
    options?: SignalHandlerOptions,
): () => void {
    const log = options?.logger
        ?? app.logger?.("signal")
        ?? consoleLoggerFactory("signal");
    const timeout = options?.timeout === undefined ? 10_000 : options.timeout;
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
