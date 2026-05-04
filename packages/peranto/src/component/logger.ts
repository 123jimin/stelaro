import type {ComponentId} from "./component.ts";

export type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

export type LoggerFactory = (component_id: ComponentId) => Logger;

type ConsoleLogMethod = (...args: unknown[]) => void;

export function consoleLoggerFactory(component_id: ComponentId): Logger {
    return {
        debug(...args: unknown[]) {
            writeConsoleLog(console.debug.bind(console), component_id, args);
        },
        info(...args: unknown[]) {
            writeConsoleLog(console.info.bind(console), component_id, args);
        },
        warn(...args: unknown[]) {
            writeConsoleLog(console.warn.bind(console), component_id, args);
        },
        error(...args: unknown[]) {
            writeConsoleLog(console.error.bind(console), component_id, args);
        },
    };
}

function writeConsoleLog(
    write: ConsoleLogMethod,
    component_id: ComponentId,
    args: unknown[],
): void {
    write(`[${component_id}]`, ...args);
}
