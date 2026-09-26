import {inspect} from "node:util";

import type {Logger, LoggerFactory} from "@jiminp/stelaro";
import type {Logger as PinoLogger} from "pino";

type LogLevel = "debug" | "info" | "warn" | "error";

function emit(child: PinoLogger, level: LogLevel, args: unknown[]): void {
    if(!child.isLevelEnabled(level)) return;
    const [first, ...rest] = args;
    const merge = typeof first === "object" && first !== null && !Array.isArray(first);
    const message_args = merge ? rest : args;
    // Matches `console.*(prefix, ...args)`: arguments after the prefix are never printf-formatted.
    const message = message_args.map((arg) => typeof arg === "string" ? arg : inspect(arg)).join(" ");
    if(!merge) child[level](message);
    else if(message_args.length > 0) child[level](first, message);
    else child[level](first);
}

/**
 * A Stelaro {@link LoggerFactory} over a pino root that also exposes each component's pino child.
 *
 * @category Logging
 */
export type PinoLoggerFactory = LoggerFactory & {
    /** Returns a new pino child of the root bound to `component_id` as `component` */
    childPinoLogger(component_id: string): PinoLogger;
};

/**
 * Adapts a configured pino logger into a Stelaro {@link LoggerFactory}.
 *
 * The caller owns the pino instance: level, transports, and output formatting are configured
 * on it. Each component id yields a child logger whose records carry the id under a
 * `component` field.
 *
 * @param root - A configured pino root logger
 * @returns A {@link PinoLoggerFactory} producing component-scoped loggers
 *
 * @remarks
 * A leading non-null, non-array object merges into the record; the remaining arguments form the
 * message as the default console logger renders them.
 *
 * @example
 * ```ts
 * import {defineApplication} from "@jiminp/stelaro";
 * import {definePinoLogger} from "@jiminp/stelaro-pino";
 * import pino from "pino";
 *
 * const app = defineApplication({
 *     components: [GreeterComponent],
 *     logger: definePinoLogger(pino({level: "debug"})),
 * });
 * ```
 *
 * @category Logging
 */
export function definePinoLogger(root: PinoLogger): PinoLoggerFactory {
    const childPinoLogger = (component_id: string): PinoLogger => root.child({component: component_id});
    const factory: LoggerFactory = (component_id): Logger => {
        const child = childPinoLogger(component_id);
        return {
            debug(...args: unknown[]) { emit(child, "debug", args); },
            info(...args: unknown[]) { emit(child, "info", args); },
            warn(...args: unknown[]) { emit(child, "warn", args); },
            error(...args: unknown[]) { emit(child, "error", args); },
        };
    };
    return Object.assign(factory, {childPinoLogger});
}
