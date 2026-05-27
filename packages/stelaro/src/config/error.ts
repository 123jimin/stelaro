import {StelaroError} from "../error.ts";

/**
 * Thrown when a config TOML file cannot be read from disk.
 *
 * @category Errors
 */
export class ConfigFileError extends StelaroError {
    /** Path of the file that failed to load */
    readonly file_path: string;
    /** Owning component id, or `null` for application-level config */
    readonly component_id: string | null;

    constructor(file_path: string, component_id: string | null, cause: unknown) {
        const target = component_id != null
            ? `component "${component_id}"`
            : "application";
        super(`Failed to read config file for ${target}: ${file_path}`);
        this.file_path = file_path;
        this.component_id = component_id;
        this.cause = cause;
    }
}

/**
 * Thrown when a parsed config object fails schema validation.
 *
 * @category Errors
 */
export class ConfigValidationError extends StelaroError {
    /** Path of the validated config file */
    readonly file_path: string;
    /** Owning component id, or `null` for application-level config */
    readonly component_id: string | null;

    constructor(file_path: string, component_id: string | null, cause: unknown) {
        const target = component_id != null
            ? `component "${component_id}"`
            : "application";
        super(`Config validation failed for ${target}: ${file_path}`);
        this.file_path = file_path;
        this.component_id = component_id;
        this.cause = cause;
    }
}

/**
 * Thrown when a secrets TOML file cannot be read from disk.
 *
 * @category Errors
 */
export class SecretsFileError extends StelaroError {
    /** Path of the file that failed to load */
    readonly file_path: string;
    /** Owning component id, or `null` for application-level secrets */
    readonly component_id: string | null;

    constructor(file_path: string, component_id: string | null, cause: unknown) {
        const target = component_id != null
            ? `component "${component_id}"`
            : "application";
        super(`Failed to read secrets file for ${target}: ${file_path}`);
        this.file_path = file_path;
        this.component_id = component_id;
        this.cause = cause;
    }
}

/**
 * Thrown when a parsed secrets object fails schema validation.
 *
 * @category Errors
 */
export class SecretsValidationError extends StelaroError {
    /** Path of the validated secrets file */
    readonly file_path: string;
    /** Owning component id, or `null` for application-level secrets */
    readonly component_id: string | null;

    constructor(file_path: string, component_id: string | null, cause: unknown) {
        const target = component_id != null
            ? `component "${component_id}"`
            : "application";
        super(`Secrets validation failed for ${target}: ${file_path}`);
        this.file_path = file_path;
        this.component_id = component_id;
        this.cause = cause;
    }
}
