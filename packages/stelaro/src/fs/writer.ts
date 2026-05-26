import {mkdir, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

import {stringify as stringifyToml} from "smol-toml";

/** @category Fluent FS */
export type FileWriter = {
    text(content: string): Promise<void>;
    buffer(data: Buffer): Promise<void>;
    json(value: unknown): Promise<void>;
    toml(value: Record<string, unknown>): Promise<void>;
};

async function ensureWrite(file_path: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void> {
    await mkdir(dirname(file_path), {recursive: true});
    await writeFile(file_path, data, encoding);
}

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
