import {StelaroError} from "../error.ts";
import {quote} from "../util/index.ts";

/**
 * An error raised for a component ID outside lowercase kebab-case.
 *
 * @category Errors
 */
export class InvalidComponentIdError extends StelaroError {
    /** The invalid component ID. */
    readonly component_id: string;

    /**
     * Create an error for an invalid component ID.
     *
     * @param component_id - Invalid component ID
     */
    constructor(component_id: string) {
        super(`Invalid component ID ${quote(component_id)}. Expected lowercase kebab-case.`);
        this.component_id = component_id;
    }
}

/**
 * An error raised when merged surfaces belong to different components.
 *
 * @category Errors
 */
export class MismatchedComponentIdError extends StelaroError {
    /** The component ID of the first surface. */
    readonly expected_component_id: string;

    /** The component ID of the conflicting surface. */
    readonly actual_component_id: string;

    /**
     * Create an error for mismatched component IDs.
     *
     * @param expected_component_id - Component ID of the first surface
     * @param actual_component_id - Component ID of the conflicting surface
     */
    constructor(expected_component_id: string, actual_component_id: string) {
        super(`Cannot merge calls for component ${quote(actual_component_id)} into ${quote(expected_component_id)}.`);
        this.expected_component_id = expected_component_id;
        this.actual_component_id = actual_component_id;
    }
}

/**
 * An error raised when a component call is declared more than once.
 *
 * @category Errors
 */
export class DuplicateCallError extends StelaroError {
    /** The ID of the component declaring the call. */
    readonly component_id: string;

    /** The name declared more than once. */
    readonly call_name: string;

    /**
     * Create an error for a duplicate component call.
     *
     * @param component_id - ID of the component declaring the call
     * @param call_name - Duplicate call name
     */
    constructor(component_id: string, call_name: string) {
        super(`Duplicate call ${quote(call_name)} for component ${quote(component_id)}.`);
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * An error raised when a component's state prevents it from serving a call.
 *
 * @category Errors
 */
export class ComponentNotReadyError extends StelaroError {
    /** The ID of the component that could not serve the call. */
    readonly component_id: string;

    /**
     * Create an error for a component that is not ready.
     *
     * @param component_id - ID of the component handling the call
     */
    constructor(component_id: string) {
        super(`Component ${quote(component_id)} is not ready to serve calls.`);
        this.component_id = component_id;
    }
}

/**
 * An error carrying a message suitable for an end user.
 *
 * @category Errors
 */
export class UserFacingError extends StelaroError {
    /** The message that can be shown to the end user. */
    readonly user_message: string;

    /**
     * Create an error with a message for the end user.
     *
     * @param user_message - Text to display to the end user
     * @param options - Error options including an optional internal cause
     *
     * @remarks
     * Present `user_message` to users and keep the cause private.
     */
    constructor(user_message: string, options?: ErrorOptions) {
        super(user_message, options);
        this.user_message = user_message;
    }
}
