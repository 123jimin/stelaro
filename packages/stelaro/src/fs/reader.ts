import {constants, type FileHandle, open} from "node:fs/promises";

import {parse as parseToml} from "smol-toml";

import type {Schema} from "../schema.ts";
import {NotRegularFileError} from "./error.ts";

/**
 * Fluent file reader with format-specific parsing and optional schema validation. It reads only
 * regular files, and a symlink counts as the file it points to. Anything else throws
 * {@link NotRegularFileError}.
 *
 * @see {@link OptionalFileReader} for the variant that returns `null` when nothing exists at the path
 * @category Fluent FS
 */
export type FileReader = {
    /**
     * Selects reads that yield `null` instead of throwing when nothing exists at the path.
     *
     * @returns An {@link OptionalFileReader} for the same file
     */
    optional(): OptionalFileReader;
    /** Reads the file as a UTF-8 string */
    text(): Promise<string>;
    /** Reads the file as a raw `Buffer` */
    buffer(): Promise<Buffer>;
    /** Parses the file as JSON */
    json(): Promise<unknown>;
    /**
     * Parses the file as JSON and validates it against a schema.
     *
     * @typeParam TSchema - Schema that validates the parsed value
     * @param schema - Schema whose `assert` validates the parsed value
     * @returns The validated value
     */
    json<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"]>;
    /** Parses the file as TOML */
    toml(): Promise<unknown>;
    /**
     * Parses the file as TOML and validates it against a schema.
     *
     * @typeParam TSchema - Schema that validates the parsed value
     * @param schema - Schema whose `assert` validates the parsed value
     * @returns The validated value
     */
    toml<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"]>;
};

/**
 * File reader variant that returns `null` when nothing exists at the path.
 *
 * Something other than a regular file still throws {@link NotRegularFileError}, and other I/O,
 * parsing, and validation errors are still thrown.
 *
 * @see {@link FileReader}
 * @category Fluent FS
 */
export type OptionalFileReader = {
    /** Reads the file as a UTF-8 string, or `null` if missing */
    text(): Promise<string | null>;
    /** Reads the file as a raw `Buffer`, or `null` if missing */
    buffer(): Promise<Buffer | null>;
    /** Parses the file as JSON, or `null` if missing */
    json(): Promise<unknown>;
    /**
     * Parses the file as JSON and validates it against a schema.
     *
     * @typeParam TSchema - Schema that validates the parsed value
     * @param schema - Schema whose `assert` validates the parsed value
     * @returns The validated value, or `null` if missing
     */
    json<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"] | null>;
    /** Parses the file as TOML, or `null` if missing */
    toml(): Promise<unknown>;
    /**
     * Parses the file as TOML and validates it against a schema.
     *
     * @typeParam TSchema - Schema that validates the parsed value
     * @param schema - Schema whose `assert` validates the parsed value
     * @returns The validated value, or `null` if missing
     */
    toml<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"] | null>;
};

type Parse = (text: string) => unknown;

// Codes meaning nothing can exist at the path.
const MISSING_FILE_CODES: Record<string, true> = {ENOENT: true, ENOTDIR: true, ENAMETOOLONG: true};

async function nullOnFileMissing<T>(read: () => Promise<T>): Promise<T | null> {
    try {
        return await read();
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if(code != null && MISSING_FILE_CODES[code] === true) return null;
        throw error;
    }
}

// Non-blocking, so opening a FIFO returns instead of waiting for a writer; Windows lacks the flag.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/** Reads `file_path`, checking through the same handle that it is a regular file. */
async function readRegularFile(file_path: string): Promise<Buffer> {
    let handle: FileHandle;
    try {
        handle = await open(file_path, OPEN_FLAGS);
    } catch (error) {
        // Opening a Unix socket fails with `ENXIO`.
        if((error as NodeJS.ErrnoException).code === "ENXIO") throw new NotRegularFileError(file_path);
        throw error;
    }
    try {
        if(!(await handle.stat()).isFile()) throw new NotRegularFileError(file_path);
        return await handle.readFile();
    } finally {
        await handle.close();
    }
}

function parseValidate(text: string, parse: Parse, schema?: Schema): unknown {
    const value: unknown = parse(text);
    return schema != null ? schema.assert(value) : value;
}

export function createFileReader(file_path: string): FileReader {
    const text = async () => (await readRegularFile(file_path)).toString("utf-8");
    const reader: FileReader = {
        optional: () => createOptionalFileReader(reader),
        text,
        buffer: () => readRegularFile(file_path),
        json: async (schema?: Schema) => parseValidate(await text(), JSON.parse, schema),
        toml: async (schema?: Schema) => parseValidate(await text(), parseToml, schema),
    } as FileReader;
    return reader;
}

function createOptionalFileReader(reader: FileReader): OptionalFileReader {
    const text = () => nullOnFileMissing(reader.text);

    async function parseOptional(parse: Parse, schema?: Schema): Promise<unknown> {
        const content = await text();
        return content == null ? null : parseValidate(content, parse, schema);
    }

    return {
        text,
        buffer: () => nullOnFileMissing(reader.buffer),
        json: (schema?: Schema) => parseOptional(JSON.parse, schema),
        toml: (schema?: Schema) => parseOptional(parseToml, schema),
    } as OptionalFileReader;
}
