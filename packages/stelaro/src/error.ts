/** @category Errors */
export abstract class StelaroError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

const COMPONENT_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** @category Component */
export function isValidComponentId(id: string): boolean {
    return COMPONENT_ID_PATTERN.test(id);
}

/** @category Errors */
export class InvalidComponentIdError extends StelaroError {
    readonly component_id: string;

    constructor(component_id: string) {
        super(
            `Invalid component id "${component_id}". Component ids must be lowercase kebab-case (e.g., "my-component").`,
        );
        this.component_id = component_id;
    }
}
