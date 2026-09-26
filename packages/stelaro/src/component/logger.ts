/**
 * Structured logger with leveled output methods.
 *
 * @category Logging
 */
export type Logger = {
    /** Logs a debug-level message */
    debug(...args: unknown[]): void;
    /** Logs an info-level message */
    info(...args: unknown[]): void;
    /** Logs a warning-level message */
    warn(...args: unknown[]): void;
    /** Logs an error-level message */
    error(...args: unknown[]): void;
};

/** Creates a {@link Logger} for the given scope, such as a component id.
 *
 * @category Logging
 */
export type LoggerFactory = (scope: string) => Logger;

/**
 * Creates a logger that writes to the console with a `[scope]` prefix.
 *
 * @param scope - Scope prepended to every log line
 * @returns A console-backed {@link Logger}
 * @category Logging
 */
export function consoleLoggerFactory(scope: string): Logger {
    const prefix = `[${scope}]`;
    return {
        debug: (...args) => console.debug(prefix, ...args),
        info: (...args) => console.info(prefix, ...args),
        warn: (...args) => console.warn(prefix, ...args),
        error: (...args) => console.error(prefix, ...args),
    };
}
