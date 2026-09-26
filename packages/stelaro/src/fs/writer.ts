import {mkdir, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

import {stringify as stringifyToml} from "smol-toml";

/**
 * Fluent file writer with format-specific serialization.
 *
 * Parent directories are created automatically and existing files are overwritten.
 *
 * @category Fluent FS
 */
export type FileWriter = {
    /** Writes a UTF-8 string to the file */
    text(content: string): Promise<void>;
    /** Writes raw binary data to the file */
    buffer(data: Buffer): Promise<void>;
    /**
     * Serializes a value as JSON and writes it to the file.
     *
     * @param value - JSON-serializable value
     * @throws {TypeError} If `value` has no JSON representation
     */
    json(value: unknown): Promise<void>;
    /** Serializes a value as TOML and writes it to the file */
    toml(value: Record<string, unknown>): Promise<void>;
};

async function ensureWrite(file_path: string, data: string | Buffer): Promise<void> {
    await mkdir(dirname(file_path), {recursive: true});
    await writeFile(file_path, data);
}

export function createFileWriter(file_path: string): FileWriter {
    return {
        text(content: string) {
            return ensureWrite(file_path, content);
        },
        buffer(data: Buffer) {
            return ensureWrite(file_path, data);
        },
        async json(value: unknown) {
            const content: string | undefined = JSON.stringify(value);
            if(content == null) throw new TypeError("Value has no JSON representation.");
            await ensureWrite(file_path, content);
        },
        async toml(value: Record<string, unknown>) {
            await ensureWrite(file_path, stringifyToml(value));
        },
    };
}
