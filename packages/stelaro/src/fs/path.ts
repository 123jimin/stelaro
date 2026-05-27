import {isAbsolute, join as pathJoin, resolve} from "node:path";

import {createFileReader, type FileReader} from "./reader.ts";
import {createFileWriter, type FileWriter} from "./writer.ts";

/**
 * Immutable path wrapper with fluent navigation and file I/O access.
 *
 * @category Fluent FS
 */
export type FluentPath = {
    /** Resolved absolute path */
    readonly path: string;
    /**
     * Joins path segments using standard path resolution.
     *
     * @param segments - Path segments to append
     * @returns A new {@link FluentPath} at the joined location
     */
    join(...segments: string[]): FluentPath;
    /**
     * Joins path segments while confining the result to this path as a base.
     *
     * Absolute segments reset to the base, and `..` is capped so the result
     * never escapes the base directory.
     *
     * @param segments - Path segments to confine
     * @returns A new {@link FluentPath} within the base directory
     */
    confine(...segments: string[]): FluentPath;
    /**
     * Creates a {@link FileReader} for the file at this path.
     *
     * @see {@link FileReader}
     */
    read(): FileReader;
    /**
     * Creates a {@link FileWriter} for the file at this path.
     *
     * @see {@link FileWriter}
     */
    write(): FileWriter;
};

/**
 * Creates a {@link FluentPath} from a base path, resolving it to an absolute path.
 *
 * @param base - Base directory or file path
 * @returns A new {@link FluentPath}
 * @category Fluent FS
 */
export function fluentPath(base: string): FluentPath {
    return createFluentPath(resolve(base));
}

function createFluentPath(absolute_path: string): FluentPath {
    return {
        path: absolute_path,
        join(...segments: string[]) {
            return createFluentPath(pathJoin(absolute_path, ...segments));
        },
        confine(...segments: string[]) {
            return createFluentPath(confinePath(absolute_path, segments));
        },
        read() {
            return createFileReader(absolute_path);
        },
        write() {
            return createFileWriter(absolute_path);
        },
    };
}

function confinePath(base: string, segments: string[]): string {
    const parts: string[] = [];

    for(const segment of segments) {
        if(isAbsolute(segment)) {
            parts.length = 0;
        }

        for(const part of segment.split(/[/\\]/)) {
            if(part === "" || part === ".") continue;
            if(part === "..") {
                if(parts.length > 0) parts.pop();
                continue;
            }
            if(/^[a-zA-Z]:$/.test(part)) continue;
            parts.push(part);
        }
    }

    return parts.length === 0 ? base : pathJoin(base, ...parts);
}
