import {join, resolve} from "node:path";

import type {FileReader, OptionalFileReader} from "./reader.js";
import {createFileReader, createOptionalFileReader} from "./reader.js";
import type {FileWriter} from "./writer.js";
import {createFileWriter} from "./writer.js";

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
     * import {fluentPath} from "@jiminp/stelaro";
     *
     * const settings = fluentPath("config").confine("../../settings.toml");
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
export function fluentPath(base: string): FluentPath {
    return createPath(resolve(base));
}

function createPath(path: string): FluentPath {
    function read(options: ReadOptions & {readonly optional: true}): OptionalFileReader;
    function read(options?: ReadOptions): FileReader;
    function read(options?: ReadOptions): FileReader | OptionalFileReader {
        return options?.optional ? createOptionalFileReader(path) : createFileReader(path);
    }

    return Object.freeze({
        path,
        join: (...segments: string[]) => createPath(resolve(join(path, ...segments))),
        confine: (...segments: string[]) => {
            const names: string[] = [];
            for(const segment of segments) {
                if(/^(?:[a-z]:|[\\/])/i.test(segment)) {
                    names.length = 0;
                }
                for(const name of segment.replace(/^[a-z]:/i, "").split(/[\\/]/)) {
                    if(name === "..") {
                        names.pop();
                    } else if(name !== "" && name !== ".") {
                        names.push(name);
                    }
                }
            }

            return createPath(names.length === 0 ? path : join(path, names.join("/")));
        },
        read,
        write: () => createFileWriter(path),
    });
}
