import {readFile} from "node:fs/promises";

import {parse as parseToml} from "smol-toml";

import type {Schema} from "../schema.ts";

/** @category Fluent FS */
export type FileReader = {
    optional(): OptionalFileReader;
    text(): Promise<string>;
    buffer(): Promise<Buffer>;
    json(): Promise<unknown>;
    json<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"]>;
    toml(): Promise<unknown>;
    toml<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"]>;
};

/** @category Fluent FS */
export type OptionalFileReader = {
    text(): Promise<string | null>;
    buffer(): Promise<Buffer | null>;
    json(): Promise<unknown>;
    json<TSchema extends Schema>(schema: TSchema): Promise<TSchema["infer"] | null>;
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
