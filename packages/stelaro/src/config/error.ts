import type {ComponentId} from "../component/calls.ts";
import {StelaroError} from "../error.ts";
import {quote} from "../util/index.ts";

/**
 * An error raised when a configuration file cannot be read or parsed.
 *
 * @category Errors
 */
export class ConfigFileError extends StelaroError {
    /** The component that declares the configuration. */
    readonly component_id: ComponentId;
    /** The path to the file that failed to load. */
    readonly file_path: string;

    /**
     * Create an error for a configuration file failure.
     * @param component_id - ID of the component declaring the configuration
     * @param file_path - Path to the base or overlay file
     * @param cause - Original read or parse error
     */
    constructor(component_id: ComponentId, file_path: string, cause: unknown) {
        super(`Could not load configuration for ${quote(component_id)} from ${quote(file_path)}.`, {cause});
        this.component_id = component_id;
        this.file_path = file_path;
    }
}

/**
 * An error raised when a secrets file cannot be read or parsed.
 *
 * @category Errors
 */
export class SecretsFileError extends StelaroError {
    /** The component that declares the secrets. */
    readonly component_id: ComponentId;
    /** The path to the file that failed to load. */
    readonly file_path: string;

    /**
     * Create an error for a secrets file failure.
     * @param component_id - ID of the component declaring the secrets
     * @param file_path - Path to the base or overlay file
     * @param cause - Original read or parse error
     */
    constructor(component_id: ComponentId, file_path: string, cause: unknown) {
        super(`Could not load secrets for ${quote(component_id)} from ${quote(file_path)}.`, {cause});
        this.component_id = component_id;
        this.file_path = file_path;
    }
}

/**
 * An error raised when the component's configuration fails schema validation.
 *
 * @category Errors
 */
export class ConfigValidationError extends StelaroError {
    /** The component that declares the configuration. */
    readonly component_id: ComponentId;

    /**
     * Create an error for a configuration schema failure.
     * @param component_id - ID of the component declaring the configuration
     * @param cause - Original schema error
     */
    constructor(component_id: ComponentId, cause: unknown) {
        super(`Configuration for ${quote(component_id)} failed validation.`, {cause});
        this.component_id = component_id;
    }
}

/**
 * An error raised when the component's secrets fail schema validation.
 *
 * @category Errors
 */
export class SecretsValidationError extends StelaroError {
    /** The component that declares the secrets. */
    readonly component_id: ComponentId;

    /**
     * Create an error for a secrets schema failure.
     * @param component_id - ID of the component declaring the secrets
     * @param cause - Original schema error
     */
    constructor(component_id: ComponentId, cause: unknown) {
        super(`Secrets for ${quote(component_id)} failed validation.`, {cause});
        this.component_id = component_id;
    }
}
