import process from "node:process";
import {isMainThread} from "node:worker_threads";

import type {Logger, LoggerFactory} from "../component/logger.ts";
import {consoleLoggerFactory} from "../component/logger.ts";

/**
 * Shutdown and logging options for a signal attachment.
 *
 * @category Utility
 */
export type SignalHandlerOptions = {
    /** The shutdown timeout in milliseconds, defaulting to 10,000. Pass `null` to disable it. */
    readonly timeout_ms?: number | null;
    /** A logger that overrides the application's `signal` logger. */
    readonly logger?: Logger;
};

/**
 * Stop the application on the first `SIGINT` or `SIGTERM` and exit the process.
 *
 * @param application - Application to stop
 * @param options - Shutdown timeout and logger overrides
 * @returns A cleanup function that removes the listeners installed by this call
 *
 * @remarks
 * Further signals through this attachment are ignored during shutdown.
 * The process exits with code 0 on success or code 1 if shutdown fails or times out.
 * Logging defaults to the application's `signal` logger, or a console logger with the same scope.
 * Attaching is a no-op where process signal listeners are unavailable.
 *
 * @example
 * ```typescript
 * import {attachSignalHandlers, createApplication} from "@jiminp/stelaro";
 *
 * const app = createApplication({components: []});
 * await app.start();
 * attachSignalHandlers(app, {timeout_ms: 5_000});
 * ```
 *
 * @category Utility
 */
export function attachSignalHandlers(
    application: {stop(): Promise<void>; readonly logger?: LoggerFactory},
    options: SignalHandlerOptions = {},
): () => void {
    if(!isMainThread) {
        return () => {};
    }

    const {timeout_ms = 10_000} = options;
    let stopping = false;

    async function onSignal(signal: NodeJS.Signals): Promise<void> {
        if(stopping) {
            return;
        }
        stopping = true;

        const log = options.logger ?? application.logger?.("signal") ?? consoleLoggerFactory("signal");
        log.info(`Received ${signal}. Stopping the application.`);

        const timer = timeout_ms === null
            ? null
            : setTimeout(() => {
                    try {
                        log.error(`Application shutdown timed out after ${timeout_ms} ms.`);
                    } finally {
                        process.exit(1);
                    }
                }, timeout_ms);

        let exit_code = 0;
        try {
            await application.stop();
        } catch (error) {
            exit_code = 1;
            log.error("Application shutdown failed.", error);
        } finally {
            if(timer !== null) {
                clearTimeout(timer);
            }
            process.exit(exit_code);
        }
    }

    const onSigint = onSignal.bind(null, "SIGINT");
    const onSigterm = onSignal.bind(null, "SIGTERM");

    function cleanup(): void {
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
    }

    try {
        process.on("SIGINT", onSigint);
        process.on("SIGTERM", onSigterm);
    } catch{
        cleanup();
    }

    return cleanup;
}
