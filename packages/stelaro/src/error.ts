/**
 * Base class for all framework-specific errors.
 *
 * @category Errors
 */
export abstract class StelaroError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

const COMPONENT_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Tests whether a string is a valid component id.
 *
 * @param id - Candidate identifier to test
 * @returns `true` if the id matches the required kebab-case pattern
 * @category Component
 */
export function isValidComponentId(id: string): boolean {
    return COMPONENT_ID_PATTERN.test(id);
}

/**
 * Represents an error whose message is safe to display to end users.
 *
 * @category Errors
 */
export class UserFacingError extends StelaroError {
    /** Message intended for the end user */
    readonly user_message: string;

    constructor(user_message: string) {
        super(user_message);
        this.user_message = user_message;
    }
}

/**
 * Thrown when a component id does not match the required kebab-case format.
 *
 * @category Errors
 */
export class InvalidComponentIdError extends StelaroError {
    /** The invalid id that was provided */
    readonly component_id: string;

    constructor(component_id: string) {
        super(
            `Invalid component id "${component_id}". Component ids must be lowercase kebab-case (e.g., "my-component").`,
        );
        this.component_id = component_id;
    }
}
