import {format} from "node:util";

import type {Logger, LoggerFactory} from "@jiminp/stelaro";
import type {Logger as PinoLogger} from "pino";

type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Maps the core {@link Logger}'s variadic call onto pino's `(mergeObject?, message?)`
 * convention. A leading non-null, non-array object is pino's merge target; the remaining
 * arguments are formatted into the message the same way the default console logger formats
 * them, so backend swaps do not change message composition. Arrays and primitives are message
 * content, never merge targets.
 */
function emit(child: PinoLogger, level: LogLevel, args: unknown[]): void {
    const [first, ...rest] = args;
    if(typeof first === "object" && first !== null && !Array.isArray(first)) {
        if(rest.length > 0) child[level](first, format(...rest));
        else child[level](first);
    } else {
        child[level](format(...args));
    }
}

/**
 * Adapts a configured pino logger into a Stelaro {@link LoggerFactory}.
 *
 * The caller owns the pino instance: level, transports, and output formatting are configured
 * on it. Each component id yields a child logger whose records carry the id under a
 * `component` field.
 *
 * @param root - A configured pino root logger
 * @returns A {@link LoggerFactory} producing component-scoped loggers
 * @category Logging
 */
export function definePinoLogger(root: PinoLogger): LoggerFactory {
    return (component_id): Logger => {
        const child = root.child({component: component_id});
        return {
            debug(...args: unknown[]) { emit(child, "debug", args); },
            info(...args: unknown[]) { emit(child, "info", args); },
            warn(...args: unknown[]) { emit(child, "warn", args); },
            error(...args: unknown[]) { emit(child, "error", args); },
        };
    };
}
