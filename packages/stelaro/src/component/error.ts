import {StelaroError} from "../error.ts";

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
        super(`Invalid component ID ${JSON.stringify(component_id)}. Expected lowercase kebab-case.`);
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
        super(`Cannot merge calls for component ${JSON.stringify(actual_component_id)} into ${JSON.stringify(expected_component_id)}.`);
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
        super(`Duplicate call ${JSON.stringify(call_name)} for component ${JSON.stringify(component_id)}.`);
        this.component_id = component_id;
        this.call_name = call_name;
    }
}
