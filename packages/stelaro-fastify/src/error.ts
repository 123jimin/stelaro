import type {ComponentCallName, ComponentId} from "@jiminp/stelaro";
import {StelaroError} from "@jiminp/stelaro";

/**
 * A request part validated by a route schema.
 *
 * @category Gateway
 */
export type RouteRequestPart = "params" | "body" | "querystring";

/**
 * An error raised when a request part fails its route schema.
 *
 * @remarks
 * Fastify's default error handler answers it with status 400.
 *
 * @category Errors
 */
export class RouteValidationError extends StelaroError {
    /** The HTTP status code for Fastify's error handling. */
    readonly statusCode = 400;

    /** The request part that failed validation. */
    readonly validationContext: RouteRequestPart;

    /**
     * Create an error for a failed request part.
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
 * An error raised by a handler when a requested resource does not exist.
 *
 * @remarks
 * Fastify's default error handler answers it with status 404.
 *
 * @category Errors
 */
export class NotFoundError extends StelaroError {
    /** The HTTP status code for Fastify's error handling. */
    readonly statusCode = 404;

    /**
     * Create an error for a missing resource.
     *
     * @param message - Description of the missing resource (default: `"Not Found"`)
     * @param options - Standard error options, such as `cause`
     */
    constructor(message = "Not Found", options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * An error raised when a handler calls a component on routes mounted without a call function.
 *
 * @category Errors
 */
export class UnboundCallError extends StelaroError {
    /** The ID of the called component. */
    readonly component_id: ComponentId;

    /** The name of the called call. */
    readonly call_name: ComponentCallName;

    /**
     * Create an error for an unbound component call.
     *
     * @param component_id - ID of the called component
     * @param call_name - Name of the called call
     */
    constructor(component_id: ComponentId, call_name: ComponentCallName) {
        super(`Cannot call ${JSON.stringify(`${component_id}.${call_name}`)} from routes mounted without a call function.`);
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * An error raised when a handler reads configuration on routes mounted without a configuration getter.
 *
 * @category Errors
 */
export class UnboundConfigError extends StelaroError {
    /**
     * Create an error for unbound configuration.
     */
    constructor() {
        super("Cannot read configuration from routes mounted without a configuration getter.");
    }
}
