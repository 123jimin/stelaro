import {StelaroError} from "../error.ts";

abstract class ConfigSourceError extends StelaroError {
    /** Path of the TOML file involved in the failure */
    readonly file_path: string;
    /** Id of the component that owns the file */
    readonly component_id: string;

    constructor(summary: string, file_path: string, component_id: string, cause: unknown) {
        super(`${summary} for component "${component_id}": ${file_path}`, {cause});
        this.file_path = file_path;
        this.component_id = component_id;
    }
}

/**
 * Thrown when a config TOML file cannot be read or parsed.
 *
 * @category Errors
 */
export class ConfigFileError extends ConfigSourceError {
    constructor(file_path: string, component_id: string, cause: unknown) {
        super("Failed to read config file", file_path, component_id, cause);
    }
}

/**
 * Thrown when a parsed config object fails schema validation.
 *
 * @category Errors
 */
export class ConfigValidationError extends ConfigSourceError {
    constructor(file_path: string, component_id: string, cause: unknown) {
        super("Config validation failed", file_path, component_id, cause);
    }
}

/**
 * Thrown when a secrets TOML file cannot be read or parsed.
 *
 * @category Errors
 */
export class SecretsFileError extends ConfigSourceError {
    constructor(file_path: string, component_id: string, cause: unknown) {
        super("Failed to read secrets file", file_path, component_id, cause);
    }
}

/**
 * Thrown when a parsed secrets object fails schema validation.
 *
 * @category Errors
 */
export class SecretsValidationError extends ConfigSourceError {
    constructor(file_path: string, component_id: string, cause: unknown) {
        super("Secrets validation failed", file_path, component_id, cause);
    }
}
