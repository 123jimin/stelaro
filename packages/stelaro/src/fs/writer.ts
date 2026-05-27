import {mkdir, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

import {stringify as stringifyToml} from "smol-toml";

/**
 * Fluent file writer with format-specific serialization.
 *
 * Parent directories are created automatically.
 *
 * @category Fluent FS
 */
export type FileWriter = {
    /** Writes a UTF-8 string to the file */
    text(content: string): Promise<void>;
    /** Writes raw binary data to the file */
    buffer(data: Buffer): Promise<void>;
    /** Serializes a value as JSON and writes it to the file */
    json(value: unknown): Promise<void>;
    /** Serializes a value as TOML and writes it to the file */
    toml(value: Record<string, unknown>): Promise<void>;
};

async function ensureWrite(file_path: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void> {
    await mkdir(dirname(file_path), {recursive: true});
    await writeFile(file_path, data, encoding);
}

/**
 * Creates a {@link FileWriter} for the given file path.
 *
 * @param file_path - Absolute path to the target file
 * @returns A new {@link FileWriter}
 * @category Fluent FS
 */
export function createFileWriter(file_path: string): FileWriter {
    return {
        text(content: string) {
            return ensureWrite(file_path, content, "utf-8");
        },
        buffer(data: Buffer) {
            return ensureWrite(file_path, data);
        },
        async json(value: unknown) {
            await ensureWrite(file_path, JSON.stringify(value), "utf-8");
        },
        async toml(value: Record<string, unknown>) {
            await ensureWrite(file_path, stringifyToml(value), "utf-8");
        },
    };
}
