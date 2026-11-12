import type {Buffer} from "node:buffer";
import {constants} from "node:fs";
import {open, stat} from "node:fs/promises";

import {parse} from "smol-toml";

import type {Schema} from "../schema.js";
import {NotRegularFileError} from "./error.js";

interface Reader<Missing extends null> {
    /**
     * Read a file as UTF-8 text.
     *
     * @returns The decoded text
     * @throws {NotRegularFileError} The path refers to a non-regular file.
     */
    text(): Promise<string | Missing>;

    /**
     * Read a file as bytes.
     *
     * @returns The file contents
     * @throws {NotRegularFileError} The path refers to a non-regular file.
     */
    buffer(): Promise<Buffer | Missing>;

    /**
     * Parse a JSON document.
     *
     * @returns The parsed document
     * @throws {NotRegularFileError} The path refers to a non-regular file.
     * @throws {SyntaxError} The document is invalid JSON.
     */
    json(): Promise<unknown>;

    /**
     * Parse and validate a JSON document.
     *
     * @typeParam S - Validation schema type
     * @param schema - Schema to apply to the parsed document
     * @returns The schema output
     * @throws {NotRegularFileError} The path refers to a non-regular file.
     * @throws {SyntaxError} The document is invalid JSON.
     */
    json<S extends Schema>(schema: S): Promise<S["infer"] | Missing>;

    /**
     * Parse a TOML document.
     *
     * @returns The parsed document
     * @throws {NotRegularFileError} The path refers to a non-regular file.
     * @throws {TomlError} The document is invalid TOML.
     */
    toml(): Promise<unknown>;

    /**
     * Parse and validate a TOML document.
     *
     * @typeParam S - Validation schema type
     * @param schema - Schema to apply to the parsed document
     * @returns The schema output
     * @throws {NotRegularFileError} The path refers to a non-regular file.
     * @throws {TomlError} The document is invalid TOML.
     */
    toml<S extends Schema>(schema: S): Promise<S["infer"] | Missing>;
}

/**
 * A reader that requires a regular file at its path.
 *
 * @category Fluent FS
 */
export interface FileReader extends Reader<never> {
    /**
     * Create a reader that returns null for missing paths.
     *
     * @returns An optional reader for the same path
     */
    optional(): OptionalFileReader;
}

/**
 * A reader that returns null for missing paths.
 *
 * @remarks
 * Missing paths are limited to ENOENT, ENOTDIR, and ENAMETOOLONG. Filesystem,
 * parsing, and validation errors otherwise propagate.
 *
 * @category Fluent FS
 */
export type OptionalFileReader = Reader<null>;

function readBuffer(file_path: string, optional: false): Promise<Buffer>;
function readBuffer(file_path: string, optional: true): Promise<Buffer | null>;
async function readBuffer(file_path: string, optional: boolean): Promise<Buffer | null> {
    let file;
    try {
        file = await open(file_path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    } catch (error) {
        if(error instanceof Error && "code" in error) {
            switch(error.code) {
                case "ENOENT":
                case "ENOTDIR":
                case "ENAMETOOLONG":
                    if(optional) {
                        return null;
                    }
                    break;
                case "EISDIR":
                    throw new NotRegularFileError(file_path);
                case "ENXIO":
                case "ENODEV": {
                    // Some special files, including Unix sockets, cannot be opened.
                    const entry = await stat(file_path).catch(() => null);
                    if(entry != null && !entry.isFile()) {
                        throw new NotRegularFileError(file_path);
                    }
                    break;
                }
            }
        }
        throw error;
    }

    try {
        if(!(await file.stat()).isFile()) {
            throw new NotRegularFileError(file_path);
        }
        return await file.readFile();
    } finally {
        await file.close();
    }
}

function restoreTomlTables(value: unknown): unknown {
    if(Array.isArray(value)) {
        return value.map(restoreTomlTables);
    }
    if(value != null && typeof value === "object" && Object.getPrototypeOf(value) === null) {
        // Preserve the reader's plain-object table output.
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, restoreTomlTables(entry)]));
    }
    return value;
}

function createReader<Missing extends null>(buffer: () => Promise<Buffer | Missing>): Reader<Missing> {
    async function text(): Promise<string | Missing> {
        const data = await buffer();
        return data == null ? data : data.toString("utf8");
    }

    function decode(parseDocument: (content: string) => unknown) {
        return async (schema?: Schema): Promise<unknown> => {
            const content = await text();
            if(content == null) {
                return null;
            }
            const value = parseDocument(content);
            return schema == null ? value : schema.assert(value);
        };
    }

    return {text, buffer, json: decode(JSON.parse), toml: decode((content) => restoreTomlTables(parse(content)))};
}

export function createFileReader(file_path: string): FileReader {
    return {
        ...createReader<never>(() => readBuffer(file_path, false)),
        optional: () => createOptionalFileReader(file_path),
    };
}

export function createOptionalFileReader(file_path: string): OptionalFileReader {
    return createReader(() => readBuffer(file_path, true));
}
