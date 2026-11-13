import type {TomlTableWithoutBigInt, TomlValueWithoutBigInt} from "smol-toml";

import {componentFilePath} from "../application/directories.ts";
import type {ComponentId} from "../component/calls.ts";
import type {Logger} from "../component/logger.ts";
import {createFluentPath} from "../fs/path.ts";
import type {Schema} from "../schema.ts";
import {quote} from "../util/index.ts";
import {ConfigFileError, ConfigValidationError, SecretsFileError, SecretsValidationError} from "./error.ts";

type TomlTable = TomlTableWithoutBigInt;
type TomlValue = TomlValueWithoutBigInt;
type FileError = typeof ConfigFileError | typeof SecretsFileError;
type ValidationError = typeof ConfigValidationError | typeof SecretsValidationError;

function isTomlTable(value: TomlValue | undefined): value is TomlTable {
    // Fluent FS normalizes TOML tables to plain objects and preserves dates.
    return value != null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

// Tooltool 0.3.3 can merge a TOML date into a table and treat `__proto__` as a prototype setter.
function recursiveMerge(base: TomlTable, overlay: TomlTable): TomlTable {
    const entries = new Map(Object.entries(base));
    for(const [key, value] of Object.entries(overlay)) {
        const previous = entries.get(key);
        entries.set(key, isTomlTable(previous) && isTomlTable(value) ? recursiveMerge(previous, value) : value);
    }
    return Object.fromEntries(entries);
}

async function readToml(file_path: string, optional: true, component_id: ComponentId, FileError: FileError): Promise<TomlTable | null>;
async function readToml(file_path: string, optional: false, component_id: ComponentId, FileError: FileError): Promise<TomlTable>;
async function readToml(file_path: string, optional: boolean, component_id: ComponentId, FileError: FileError): Promise<TomlTable | null> {
    try {
        return await createFluentPath(file_path).read({optional}).toml() as TomlTable | null;
    } catch (cause) {
        throw new FileError(component_id, file_path, cause);
    }
}

async function validateWithOverlay<S extends Schema>(
    schema: S,
    base: TomlTable,
    dir: string,
    component_id: ComponentId,
    env: string | null,
    FileError: FileError,
    ValidationError: ValidationError,
): Promise<{readonly value: S["infer"]}> {
    const overlay = env === null ? null : await readToml(componentFilePath(dir, component_id, env), true, component_id, FileError);
    const merged = overlay === null ? base : recursiveMerge(base, overlay);
    try {
        return {value: schema.assert(merged)};
    } catch (cause) {
        throw new ValidationError(component_id, cause);
    }
}

export async function loadComponentConfig<S extends Schema>(
    component: {readonly calls: {readonly id: ComponentId}; readonly config?: S},
    dir: string,
    env: string | null,
): Promise<{readonly value: S["infer"]} | null> {
    if(component.config == null) {
        return null;
    }

    const component_id = component.calls.id;
    const file_path = componentFilePath(dir, component_id, null);
    const base = await readToml(file_path, false, component_id, ConfigFileError);
    return validateWithOverlay(component.config, base, dir, component_id, env, ConfigFileError, ConfigValidationError);
}

export async function loadComponentSecrets<S extends Schema>(
    component: {readonly calls: {readonly id: ComponentId}; readonly secrets?: S},
    dir: string,
    env: string | null,
    logger: Pick<Logger, "warn">,
): Promise<{readonly value: S["infer"]} | null> {
    if(component.secrets == null) {
        return null;
    }

    const component_id = component.calls.id;
    const file_path = componentFilePath(dir, component_id, null);
    const base = await readToml(file_path, true, component_id, SecretsFileError);
    if(base === null) {
        logger.warn(`Secrets file ${quote(file_path)} for ${quote(component_id)} is missing. Using an empty base.`);
    }
    return validateWithOverlay(component.secrets, base ?? {}, dir, component_id, env, SecretsFileError, SecretsValidationError);
}
