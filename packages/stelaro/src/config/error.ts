import {StelaroError} from "../error.ts";

abstract class ConfigSourceError extends StelaroError {
    /** Path of the TOML file involved in the failure */
    readonly file_path: string;
    /** Owning component id, or `null` for application-level files */
    readonly component_id: string | null;

    constructor(summary: string, file_path: string, component_id: string | null, cause: unknown) {
        const target = component_id != null ? `component "${component_id}"` : "application";
        super(`${summary} for ${target}: ${file_path}`);
        this.file_path = file_path;
        this.component_id = component_id;
        this.cause = cause;
    }
}

/**
 * Thrown when a config TOML file cannot be read or parsed.
 *
 * @category Errors
 */
export class ConfigFileError extends ConfigSourceError {
    constructor(file_path: string, component_id: string | null, cause: unknown) {
        super("Failed to read config file", file_path, component_id, cause);
    }
}

/**
 * Thrown when a parsed config object fails schema validation.
 *
 * @category Errors
 */
export class ConfigValidationError extends ConfigSourceError {
    constructor(file_path: string, component_id: string | null, cause: unknown) {
        super("Config validation failed", file_path, component_id, cause);
    }
}

/**
 * Thrown when a secrets TOML file cannot be read or parsed.
 *
 * @category Errors
 */
export class SecretsFileError extends ConfigSourceError {
    constructor(file_path: string, component_id: string | null, cause: unknown) {
        super("Failed to read secrets file", file_path, component_id, cause);
    }
}

/**
 * Thrown when a parsed secrets object fails schema validation.
 *
 * @category Errors
 */
export class SecretsValidationError extends ConfigSourceError {
    constructor(file_path: string, component_id: string | null, cause: unknown) {
        super("Secrets validation failed", file_path, component_id, cause);
    }
}
