import type {ComponentCallName, ComponentId} from "@jiminp/stelaro";
import {StelaroError} from "@jiminp/stelaro";

/**
 * Part of an HTTP request validated by a route schema.
 *
 * @category Gateway
 */
export type RouteRequestPart = "params" | "body" | "querystring";

/**
 * An error raised when `params`, `body`, or `querystring` fails validation.
 *
 * @remarks
 * Fastify's default error handler responds with status 400.
 * Custom error handlers can inspect `validationContext` for the failing part and `cause` for the schema error.
 *
 * @category Errors
 */
export class RouteValidationError extends StelaroError {
    /** HTTP status code read by Fastify's error handler. */
    readonly statusCode = 400;

    /** Request part that failed validation. */
    readonly validationContext: RouteRequestPart;

    /**
     * Create a route validation error.
     *
     * @param validation_context - Request part that failed validation
     * @param cause - Error thrown by the schema
     */
    constructor(validation_context: RouteRequestPart, cause: unknown) {
        super(`Invalid request ${validation_context}.`, {cause});
        this.validationContext = validation_context;
    }
}

/**
 * An error raised when a requested resource does not exist.
 *
 * @remarks
 * Throw this from a route handler to trigger a 404 response through Fastify's error handler.
 *
 * @category Errors
 */
export class NotFoundError extends StelaroError {
    /** HTTP status code read by Fastify's error handler. */
    readonly statusCode = 404;

    /**
     * Create a 404 error.
     *
     * @param message - Error message (default: `"Not Found"`)
     * @param options - Standard error options
     */
    constructor(message = "Not Found", options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * An error raised when a route calls a component without a bound `call` function.
 *
 * @category Errors
 */
export class UnboundCallError extends StelaroError {
    /** Target component ID. */
    readonly component_id: ComponentId;

    /** Target call name. */
    readonly call_name: ComponentCallName;

    /**
     * Create an unbound call error.
     *
     * @param component_id - Target component ID
     * @param call_name - Target call name
     */
    constructor(component_id: ComponentId, call_name: ComponentCallName) {
        super(`Cannot call ${JSON.stringify(`${component_id}.${call_name}`)} from routes mounted without a call function.`);
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * An error raised when a route calls `getConfig` without a bound configuration getter.
 *
 * @category Errors
 */
export class UnboundConfigError extends StelaroError {
    /**
     * Create an unbound configuration error.
     */
    constructor() {
        super("Cannot read configuration from routes mounted without a configuration getter.");
    }
}
