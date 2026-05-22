import {StelaroError} from "../error.ts";

/** @category Errors */
export class ConfigFileError extends StelaroError {
    readonly file_path: string;
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

/** @category Errors */
export class ConfigValidationError extends StelaroError {
    readonly file_path: string;
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

/** @category Errors */
export class SecretsFileError extends StelaroError {
    readonly file_path: string;
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

/** @category Errors */
export class SecretsValidationError extends StelaroError {
    readonly file_path: string;
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
