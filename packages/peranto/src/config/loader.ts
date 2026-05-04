import {readFile} from "node:fs/promises";

import {parse} from "smol-toml";

import {ConfigFileError, ConfigValidationError} from "./error.ts";
import type {ConfigSchema} from "./types.ts";

export async function loadTomlConfig(
    file_path: string,
    schema: ConfigSchema,
    component_id?: string,
): Promise<unknown> {
    let raw: string;
    try {
        raw = await readFile(file_path, "utf-8");
    } catch (error) {
        throw new ConfigFileError(file_path, component_id, error);
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = parse(raw);
    } catch (error) {
        throw new ConfigFileError(file_path, component_id, error);
    }

    try {
        return schema.assert(parsed);
    } catch (error) {
        throw new ConfigValidationError(file_path, component_id, error);
    }
}
