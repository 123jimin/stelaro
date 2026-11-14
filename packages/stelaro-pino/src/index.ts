import {format} from "node:util";

import type {Logger, LoggerFactory} from "@jiminp/stelaro";
import type {Logger as PinoLogger} from "pino";

/**
 * A Stelaro logger factory that can also create native Pino children.
 *
 * @category Component
 */
export type PinoLoggerFactory = LoggerFactory & {
    /**
     * Create a new Pino child scoped to a component.
     *
     * @param component_id - Value of the child's `component` binding
     * @returns A Pino child logger
     */
    childPinoLogger(component_id: string): PinoLogger;
};

function writeLog(logger: PinoLogger, level: keyof Logger, ...args: unknown[]): void {
    if(!logger.isLevelEnabled(level)) {
        return;
    }

    const first = args[0];
    if(first !== null && typeof first === "object" && !Array.isArray(first)) {
        if(args.length === 1) {
            logger[level](first);
        } else {
            logger[level](first, format(...args.slice(1)));
        }
    } else {
        logger[level](format(...args));
    }
}

/**
 * Adapt a configured Pino logger into a Stelaro logger factory.
 *
 * @param root - Pino logger configured by the caller
 * @returns A factory that binds each scope to `component`
 *
 * @remarks
 * A leading object contributes structured fields, and a leading error uses Pino's error handling.
 * Arrays and other remaining arguments are formatted with Node.js console formatting.
 *
 * @example
 * ```typescript
 * import {createApplication} from "@jiminp/stelaro";
 * import {definePinoLogger} from "@jiminp/stelaro-pino";
 * import pino from "pino";
 *
 * const logger = definePinoLogger(pino({level: "info"}));
 * const app = createApplication({components: [], logger});
 * await app.start();
 * ```
 *
 * @category Component
 */
export function definePinoLogger(root: PinoLogger): PinoLoggerFactory {
    function childPinoLogger(component_id: string): PinoLogger {
        return root.child({component: component_id});
    }

    const createLogger: LoggerFactory = (scope) => {
        const child = childPinoLogger(scope);
        return {
            debug: writeLog.bind(null, child, "debug"),
            info: writeLog.bind(null, child, "info"),
            warn: writeLog.bind(null, child, "warn"),
            error: writeLog.bind(null, child, "error"),
        };
    };

    return Object.assign(createLogger, {childPinoLogger});
}
