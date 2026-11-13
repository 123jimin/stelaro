import {join, resolve, sep} from "node:path";

import {StelaroError} from "../error.ts";
import {quote} from "../util/index.ts";
import type {ApplicationOptions} from "./application.ts";

/**
 * Default directory names relative to the application base directory.
 *
 * @category Application
 */
export const DEFAULT_APPLICATION_DIRS = Object.freeze({
    config_dir: "config",
    secrets_dir: "secrets",
    data_dir: "data",
} as const);

export function resolveApplicationDirectories(options: ApplicationOptions = {}) {
    const base_dir = resolve(options.base_dir ?? ".");
    return {
        base_dir,
        config_dir: resolve(base_dir, options.config_dir ?? DEFAULT_APPLICATION_DIRS.config_dir),
        secrets_dir: resolve(base_dir, options.secrets_dir ?? DEFAULT_APPLICATION_DIRS.secrets_dir),
        data_dir: resolve(base_dir, options.data_dir ?? DEFAULT_APPLICATION_DIRS.data_dir),
    };
}

/**
 * An error raised when the generated component filename contains a path separator, stream designator, or NUL.
 *
 * @category Errors
 */
export class InvalidComponentFileNameError extends StelaroError {
    /** The filename generated from the component ID and environment. */
    readonly file_name: string;

    /**
     * Create an error for an invalid component filename.
     *
     * @param file_name - Generated filename that failed validation
     */
    constructor(file_name: string) {
        super(`Invalid component filename: ${quote(file_name)}`);
        this.file_name = file_name;
    }
}

/**
 * Return a component's base or environment-overlay TOML path in a directory.
 *
 * @param dir - Configuration or secrets directory
 * @param component_id - Component ID
 * @param env - Environment selector, or `null` for the base file
 * @returns The path to the component's TOML file
 * @throws {InvalidComponentFileNameError} The filename contains `/` or NUL, or contains `\` or `:` on Windows.
 *
 * @category Configuration
 */
export function componentFilePath(dir: string, component_id: string, env: string | null): string {
    const file_name = env === null ? `${component_id}.toml` : `${component_id}.${env}.toml`;
    if(file_name.includes("/") || file_name.includes("\0") || (sep === "\\" && /[\\:]/u.test(file_name))) {
        throw new InvalidComponentFileNameError(file_name);
    }
    return join(dir, file_name);
}
