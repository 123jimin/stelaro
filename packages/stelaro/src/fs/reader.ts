import {readFile} from "node:fs/promises";

import {parse as parseToml} from "smol-toml";

import type {Schema} from "../schema.ts";

/**
 * Fluent file reader with format-specific parsing and optional schema validation.
 *
 * @see {@link OptionalFileReader} for the variant that returns `null` on missing files
 * @category Fluent FS
 */
export type FileReader = {
    /**
     * Selects reads that yield `null` instead of throwing when the file does not exist.
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
 * File reader variant that returns `null` when the file does not exist.
 *
 * Other I/O, parsing, and validation errors are still thrown.
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

async function nullOnFileNotFound<T>(read: () => Promise<T>): Promise<T | null> {
    try {
        return await read();
    } catch (error) {
        if((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    }
}

function parseValidate(text: string, parse: Parse, schema?: Schema): unknown {
    const value: unknown = parse(text);
    return schema != null ? schema.assert(value) : value;
}

export function createFileReader(file_path: string): FileReader {
    const text = () => readFile(file_path, "utf-8");
    const reader: FileReader = {
        optional: () => createOptionalFileReader(reader),
        text,
        buffer: () => readFile(file_path),
        json: async (schema?: Schema) => parseValidate(await text(), JSON.parse, schema),
        toml: async (schema?: Schema) => parseValidate(await text(), parseToml, schema),
    } as FileReader;
    return reader;
}

function createOptionalFileReader(reader: FileReader): OptionalFileReader {
    const text = () => nullOnFileNotFound(reader.text);

    async function parseOptional(parse: Parse, schema?: Schema): Promise<unknown> {
        const content = await text();
        return content == null ? null : parseValidate(content, parse, schema);
    }

    return {
        text,
        buffer: () => nullOnFileNotFound(reader.buffer),
        json: (schema?: Schema) => parseOptional(JSON.parse, schema),
        toml: (schema?: Schema) => parseOptional(parseToml, schema),
    } as OptionalFileReader;
}
