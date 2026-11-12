/**
 * The logging methods available to components and the application.
 *
 * @category Component
 */
export type Logger = {
    /**
     * Emit a debug message.
     *
     * @param args - Values to log
     */
    debug(...args: unknown[]): void;

    /**
     * Emit an informational message.
     *
     * @param args - Values to log
     */
    info(...args: unknown[]): void;

    /**
     * Emit a warning.
     *
     * @param args - Values to log
     */
    warn(...args: unknown[]): void;

    /**
     * Emit an error message.
     *
     * @param args - Values to log
     */
    error(...args: unknown[]): void;
};

/**
 * A function that creates a logger for a named scope.
 *
 * @param scope - Name associated with the log entries
 * @returns A logger for the requested scope
 *
 * @category Component
 */
export type LoggerFactory = (scope: string) => Logger;

function writeScopedConsole(level: keyof Logger, scope: string, ...args: unknown[]): void {
    const first = args[0];
    // The console treats a leading string as a format only when more arguments follow.
    if(typeof first === "string" && args.length > 1) {
        args[0] = scope;
        console[level](`[%s] ${first}`, ...args);
    } else {
        console[level]("[%s]", scope, ...args);
    }
}

/**
 * Create a scoped logger backed by the Node.js console.
 *
 * @param scope - Name to display in the log prefix
 * @returns A logger that uses the matching console method at each level
 *
 * @remarks
 * Log output starts with `[scope]` followed by the message in the console's usual format.
 *
 * @example
 * ```typescript
 * import {consoleLoggerFactory} from "@jiminp/stelaro";
 *
 * const log = consoleLoggerFactory("worker");
 * log.info("Processed %d jobs", 3); // [worker] Processed 3 jobs
 * ```
 *
 * @category Component
 */
export function consoleLoggerFactory(scope: string): Logger {
    return {
        debug: writeScopedConsole.bind(null, "debug", scope),
        info: writeScopedConsole.bind(null, "info", scope),
        warn: writeScopedConsole.bind(null, "warn", scope),
        error: writeScopedConsole.bind(null, "error", scope),
    };
}
