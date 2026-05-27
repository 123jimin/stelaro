import type {ComponentId} from "./types.ts";

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

/** Creates a {@link Logger} scoped to the given component id.
 *
 * @category Logging
 */
export type LoggerFactory = (component_id: ComponentId) => Logger;

type ConsoleLogMethod = (...args: unknown[]) => void;

/**
 * Creates a logger that writes to the console with a `[component_id]` prefix.
 *
 * @param component_id - Identifier prepended to every log line
 * @returns A console-backed {@link Logger}
 * @category Logging
 */
export function consoleLoggerFactory(component_id: ComponentId): Logger {
    const debug = console.debug.bind(console);
    const info = console.info.bind(console);
    const warn = console.warn.bind(console);
    const error = console.error.bind(console);
    return {
        debug(...args: unknown[]) { writeConsoleLog(debug, component_id, args); },
        info(...args: unknown[]) { writeConsoleLog(info, component_id, args); },
        warn(...args: unknown[]) { writeConsoleLog(warn, component_id, args); },
        error(...args: unknown[]) { writeConsoleLog(error, component_id, args); },
    };
}

function writeConsoleLog(
    write: ConsoleLogMethod,
    component_id: ComponentId,
    args: unknown[],
): void {
    write(`[${component_id}]`, ...args);
}
