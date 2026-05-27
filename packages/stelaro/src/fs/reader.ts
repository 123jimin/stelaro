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
     * Returns an {@link OptionalFileReader} that yields `null` instead of
     * throwing when the file does not exist.
     */
    optional(): OptionalFileReader;
    /** Reads the file as a UTF-8 string */
    text(): Promise<string>;
    /** Reads the file as a raw `Buffer` */
    buffer(): Promise<Buffer>;
    /** Parses the file as JSON, optionally validating against a schema */
    json(): Promise<unknown>;
    json<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"]>;
    /** Parses the file as TOML, optionally validating against a schema */
    toml(): Promise<unknown>;
    toml<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"]>;
};

/**
 * File reader variant that returns `null` when the file does not exist.
 *
 * Non-ENOENT errors are still thrown.
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
    json<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"] | null>;
    /** Parses the file as TOML, or `null` if missing */
    toml(): Promise<unknown>;
    toml<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"] | null>;
};

async function nullOnFileNotFound<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
        return await fn();
    } catch (error) {
        if((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    }
}

function parseValidate(text: string, parse: (text: string) => unknown, schema?: Schema): unknown {
    const value: unknown = parse(text);
    return schema != null ? schema.assert(value) : value;
}

/**
 * Creates a {@link FileReader} for the given file path.
 *
 * @param file_path - Absolute path to the target file
 * @returns A new {@link FileReader}
 * @category Fluent FS
 */
export function createFileReader(file_path: string): FileReader {
    function text(): Promise<string> {
        return readFile(file_path, "utf-8");
    }

    return {
        optional() {
            return createOptionalFileReader(file_path, text);
        },
        text,
        buffer() {
            return readFile(file_path);
        },
        async json(schema?: Schema) {
            return parseValidate(await text(), JSON.parse, schema);
        },
        async toml(schema?: Schema) {
            return parseValidate(await text(), parseToml, schema);
        },
    } as FileReader;
}

function createOptionalFileReader(
    file_path: string,
    readText: () => Promise<string>,
): OptionalFileReader {
    const textOptional = () => nullOnFileNotFound(readText);

    return {
        text: textOptional,
        buffer() {
            return nullOnFileNotFound(() => readFile(file_path));
        },
        async json(schema?: Schema) {
            const text = await textOptional();
            if(text == null) return null;
            return parseValidate(text, JSON.parse, schema);
        },
        async toml(schema?: Schema) {
            const text = await textOptional();
            if(text == null) return null;
            return parseValidate(text, parseToml, schema);
        },
    } as OptionalFileReader;
}
