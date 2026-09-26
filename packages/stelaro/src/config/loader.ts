import {recursiveMerge} from "@jiminp/tooltool";

import {fluentPath} from "../fs/path.ts";
import {
    ConfigFileError,
    ConfigValidationError,
    SecretsFileError,
    SecretsValidationError,
} from "./error.ts";
import type {ConfigSchema} from "./types.ts";

type TomlTable = Record<string, unknown>;

type TomlLoadResult = {
    readonly value: unknown;
    /** Whether the base file exists */
    readonly base_found: boolean;
};

type TomlSourceKind = {
    readonly base_required: boolean;
    readonly FileError: typeof ConfigFileError | typeof SecretsFileError;
    readonly ValidationError: typeof ConfigValidationError | typeof SecretsValidationError;
};

const CONFIG_SOURCE: TomlSourceKind = {
    base_required: true,
    FileError: ConfigFileError,
    ValidationError: ConfigValidationError,
};

const SECRETS_SOURCE: TomlSourceKind = {
    base_required: false,
    FileError: SecretsFileError,
    ValidationError: SecretsValidationError,
};

async function loadToml(
    kind: TomlSourceKind,
    file_path: string,
    overlay_path: string | null,
    schema: ConfigSchema,
    component_id: string | null,
): Promise<TomlLoadResult> {
    const readTable = async (path: string, optional: boolean): Promise<TomlTable | null> => {
        try {
            const reader = fluentPath(path).read();
            return await (optional ? reader.optional().toml() : reader.toml()) as TomlTable | null;
        } catch (error) {
            throw new kind.FileError(path, component_id, error);
        }
    };

    const base = await readTable(file_path, !kind.base_required);
    const overlay = overlay_path != null ? await readTable(overlay_path, true) : null;

    try {
        return {value: schema.assert(recursiveMerge(base ?? {}, overlay)), base_found: base != null};
    } catch (error) {
        throw new kind.ValidationError(file_path, component_id, error);
    }
}

/** Loads a required TOML config file merged with an optional overlay, then validates it. */
export async function loadTomlConfig(
    file_path: string,
    schema: ConfigSchema,
    component_id: string | null = null,
    overlay_path: string | null = null,
): Promise<unknown> {
    const {value} = await loadToml(CONFIG_SOURCE, file_path, overlay_path, schema, component_id);
    return value;
}

/** Loads an optional TOML secrets file merged with an optional overlay, then validates it. */
export function loadTomlSecrets(
    file_path: string,
    schema: ConfigSchema,
    component_id: string | null = null,
    overlay_path: string | null = null,
): Promise<TomlLoadResult> {
    return loadToml(SECRETS_SOURCE, file_path, overlay_path, schema, component_id);
}
