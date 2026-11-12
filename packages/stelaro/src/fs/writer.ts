import type {Buffer} from "node:buffer";
import {mkdir, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

import {stringify} from "smol-toml";

const pending_writes = new Map<string, Promise<void>>();

/**
 * A writer that creates parent directories and overwrites the destination file.
 *
 * @category Fluent FS
 */
export interface FileWriter {
    /**
     * Write UTF-8 text.
     *
     * @param content - Text to write
     */
    text(content: string): Promise<void>;

    /**
     * Write bytes.
     *
     * @param data - Bytes to write
     */
    buffer(data: Buffer): Promise<void>;

    /**
     * Serialize and write a JSON document.
     *
     * @param value - Value to serialize
     * @throws {TypeError} The value cannot be serialized as a JSON document.
     */
    json(value: unknown): Promise<void>;

    /**
     * Serialize and write a TOML document.
     *
     * @param value - Value to serialize
     */
    toml(value: unknown): Promise<void>;
}

/** Queue writes to the same path across writer instances. */
async function writeInOrder(file_path: string, data: string | Buffer): Promise<void> {
    const previous_write = pending_writes.get(file_path) ?? Promise.resolve();
    const current_write = previous_write.catch(() => null).then(async () => {
        await mkdir(dirname(file_path), {recursive: true});
        await writeFile(file_path, data);
    });
    pending_writes.set(file_path, current_write);
    try {
        await current_write;
    } finally {
        if(pending_writes.get(file_path) === current_write) {
            pending_writes.delete(file_path);
        }
    }
}

export function createFileWriter(file_path: string): FileWriter {
    const write = writeInOrder.bind(null, file_path);
    return {
        text: write,
        buffer: write,
        async json(value) {
            const content = JSON.stringify(value);
            if(content == null) {
                throw new TypeError("Value cannot be serialized as JSON");
            }
            await write(content);
        },
        async toml(value) {
            await write(stringify(value));
        },
    };
}
