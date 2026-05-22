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

export type SecretsLoadResult = {
    readonly value: unknown;
    readonly base_found: boolean;
};

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
