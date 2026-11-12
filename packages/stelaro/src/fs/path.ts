import {join, resolve} from "node:path";

import type {FileReader, OptionalFileReader} from "./reader.ts";
import {createOptionalFileReader, createRequiredFileReader} from "./reader.ts";
import type {FileWriter} from "./writer.ts";
import {createFileWriter} from "./writer.ts";

/**
 * Options for opening a file reader.
 *
 * @category Fluent FS
 */
export interface ReadOptions {
    /** Whether missing paths return null. */
    readonly optional?: boolean;
}

/**
 * An immutable absolute filesystem path with fluent file operations.
 *
 * @category Fluent FS
 */
export interface FluentPath {
    /** The absolute filesystem path. */
    readonly path: string;

    /**
     * Join segments to this path, allowing traversal above it.
     *
     * @param segments - Path segments to join
     * @returns A new absolute path
     */
    join(...segments: string[]): FluentPath;

    /**
     * Resolve segments within this path.
     *
     * @param segments - Path segments to resolve
     * @returns A new path at or below this path
     *
     * @remarks
     * Both slash styles separate names. Rooted segments reset to this path,
     * and parent segments stop here. Containment uses Node's filesystem path
     * interpretation and does not resolve symlinks.
     *
     * @example
     * ```typescript
     * import {createFluentPath} from "@jiminp/stelaro";
     *
     * const settings = createFluentPath("config").confine("../../settings.toml");
     * ```
     */
    confine(...segments: string[]): FluentPath;

    /**
     * Create a reader that returns null for missing paths.
     *
     * @param options - Options enabling optional reads
     * @returns An optional file reader
     */
    read(options: ReadOptions & {readonly optional: true}): OptionalFileReader;

    /**
     * Create a reader for this path.
     *
     * @param options - Reader options
     * @returns A file reader
     */
    read(options?: ReadOptions): FileReader;

    /**
     * Create a writer for this path.
     *
     * @returns A file writer
     */
    write(): FileWriter;
}

/**
 * Resolve a base path without accessing the filesystem.
 *
 * @param base - Base path, relative to the working directory if needed
 * @returns An immutable absolute path
 *
 * @category Fluent FS
 */
export function createFluentPath(base: string): FluentPath {
    return wrapAbsolutePath(resolve(base));
}

function bindPathRead(path: string): FluentPath["read"] {
    function read(options: ReadOptions & {readonly optional: true}): OptionalFileReader;
    function read(options?: ReadOptions): FileReader;
    function read(options?: ReadOptions): FileReader | OptionalFileReader {
        return options?.optional ? createOptionalFileReader(path) : createRequiredFileReader(path);
    }
    return read;
}

function joinFluentPath(path: string, ...segments: string[]): FluentPath {
    return wrapAbsolutePath(resolve(join(path, ...segments)));
}

function confineFluentPath(path: string, ...segments: string[]): FluentPath {
    const names: string[] = [];
    for(const segment of segments) {
        // Restart at the base on a leading separator or drive prefix.
        if(/^(?:[a-z]:|[\\/])/i.test(segment)) {
            names.length = 0;
        }
        // Strip the drive prefix and recognize both separator styles on every platform.
        for(const name of segment.replace(/^[a-z]:/i, "").split(/[\\/]/)) {
            if(name === "..") {
                names.pop();
            } else if(name !== "" && name !== ".") {
                names.push(name);
            }
        }
    }

    return wrapAbsolutePath(names.length === 0 ? path : join(path, names.join("/")));
}

function wrapAbsolutePath(path: string): FluentPath {
    return Object.freeze({
        path,
        join: joinFluentPath.bind(null, path),
        confine: confineFluentPath.bind(null, path),
        read: bindPathRead(path),
        write: createFileWriter.bind(null, path),
    });
}
