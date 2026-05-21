import type {ComponentId} from "./types.ts";

/** @category Logging */
export type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

/** @category Logging */
export type LoggerFactory = (component_id: ComponentId) => Logger;

type ConsoleLogMethod = (...args: unknown[]) => void;

/** @category Logging */
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
