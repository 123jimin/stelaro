import {readFile} from "node:fs/promises";

import {recursiveMerge} from "@jiminp/tooltool";
import {parse} from "smol-toml";

import {
    ConfigFileError,
    ConfigValidationError,
    SecretsFileError,
    SecretsValidationError,
} from "./error.ts";
import type {ConfigSchema} from "./types.ts";

function readToml(file_path: string): Promise<Record<string, unknown>> {
    return readFile(file_path, "utf-8").then(parse);
}

async function readOptionalToml(
    file_path: string,
): Promise<Record<string, unknown> | null> {
    try {
        return await readToml(file_path);
    } catch (error) {
        if((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

/**
 * Loads and validates a TOML config file, optionally merging an environment overlay.
 *
 * @param file_path - Path to the base config TOML file
 * @param schema - Schema to validate the merged result against
 * @param component_id - Owning component id for error context, or `null` for application-level
 * @param overlay_path - Optional environment-specific overlay file to merge
 * @returns Validated config value
 * @throws {ConfigFileError} If the base or overlay file cannot be read
 * @throws {ConfigValidationError} If the merged config fails schema validation
 */
export async function loadTomlConfig(
    file_path: string,
    schema: ConfigSchema,
    component_id: string | null = null,
    overlay_path: string | null = null,
): Promise<unknown> {
    let base: Record<string, unknown>;
    try {
        base = await readToml(file_path);
    } catch (error) {
        throw new ConfigFileError(file_path, component_id, error);
    }

    if(overlay_path != null) {
        let overlay: Record<string, unknown> | null;
        try {
            overlay = await readOptionalToml(overlay_path);
        } catch (error) {
            throw new ConfigFileError(overlay_path, component_id, error);
        }
        if(overlay != null) {
            base = recursiveMerge(base, overlay);
        }
    }

    try {
        return schema.assert(base);
    } catch (error) {
        throw new ConfigValidationError(file_path, component_id, error);
    }
}

/** Result of loading a secrets file, including whether the base file existed. */
export type SecretsLoadResult = {
    /** Validated secrets value */
    readonly value: unknown;
    /** `true` if the base secrets file was found on disk */
    readonly base_found: boolean;
};

/**
 * Loads and validates a TOML secrets file, optionally merging an environment overlay.
 *
 * Unlike config, a missing base secrets file is not an error — the result
 * indicates whether the base file was found via `base_found`.
 *
 * @param file_path - Path to the base secrets TOML file
 * @param schema - Schema to validate the merged result against
 * @param component_id - Owning component id for error context, or `null` for application-level
 * @param overlay_path - Optional environment-specific overlay file to merge
 * @returns Validated secrets value and whether the base file existed
 * @throws {SecretsFileError} If a file exists but cannot be read
 * @throws {SecretsValidationError} If the merged secrets fail schema validation
 */
export async function loadTomlSecrets(
    file_path: string,
    schema: ConfigSchema,
    component_id: string | null = null,
    overlay_path: string | null = null,
): Promise<SecretsLoadResult> {
    let base: Record<string, unknown>;
    let base_found: boolean;
    try {
        const result = await readOptionalToml(file_path);
        base = result ?? {};
        base_found = result != null;
    } catch (error) {
        throw new SecretsFileError(file_path, component_id, error);
    }

    if(overlay_path != null) {
        let overlay: Record<string, unknown> | null;
        try {
            overlay = await readOptionalToml(overlay_path);
        } catch (error) {
            throw new SecretsFileError(overlay_path, component_id, error);
        }
        if(overlay != null) {
            base = recursiveMerge(base, overlay);
        }
    }

    try {
        return {value: schema.assert(base), base_found};
    } catch (error) {
        throw new SecretsValidationError(file_path, component_id, error);
    }
}
