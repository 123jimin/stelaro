import {PerantoError} from "../error.ts";

export class ConfigFileError extends PerantoError {
    readonly file_path: string;
    readonly component_id: string | undefined;

    constructor(file_path: string, component_id: string | undefined, cause: unknown) {
        const target = component_id != null
            ? `component "${component_id}"`
            : "application";
        super(`Failed to read config file for ${target}: ${file_path}`);
        this.file_path = file_path;
        this.component_id = component_id;
        this.cause = cause;
    }
}

export class ConfigValidationError extends PerantoError {
    readonly file_path: string;
    readonly component_id: string | undefined;

    constructor(file_path: string, component_id: string | undefined, cause: unknown) {
        const target = component_id != null
            ? `component "${component_id}"`
            : "application";
        super(`Config validation failed for ${target}: ${file_path}`);
        this.file_path = file_path;
        this.component_id = component_id;
        this.cause = cause;
    }
}
