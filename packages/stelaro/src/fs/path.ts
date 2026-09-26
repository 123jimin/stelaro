import {join as pathJoin, resolve, win32} from "node:path";

import {createFileReader, type FileReader} from "./reader.ts";
import {createFileWriter, type FileWriter} from "./writer.ts";

const SEPARATOR = /[/\\]/;
const DRIVE_PREFIX = /^[a-zA-Z]:/;

/**
 * Immutable path wrapper with fluent navigation and file I/O access.
 *
 * @category Fluent FS
 */
export type FluentPath = {
    /** Resolved absolute path */
    readonly path: string;
    /**
     * Appends segments without containment; the result may traverse above this path.
     *
     * @param segments - Path segments to append
     * @returns A new {@link FluentPath} at the joined location
     */
    join(...segments: string[]): FluentPath;
    /**
     * Appends segments while confining the result to this path as a base.
     *
     * Both `/` and `\` are separators, surplus `..` stops at the base, and
     * absolute or drive-rooted segments such as `/etc`, `C:\etc`, or UNC paths
     * reset to the base.
     *
     * @param segments - Path segments to confine
     * @returns A new {@link FluentPath} at the base or one of its descendants
     */
    confine(...segments: string[]): FluentPath;
    /**
     * Creates a reader for the file at this path.
     *
     * @returns A {@link FileReader} for this path
     */
    read(): FileReader;
    /**
     * Creates a writer for the file at this path.
     *
     * @returns A {@link FileWriter} for this path
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
        // Rooted forms (`/x`, `\x`, `C:\x`, `C:/x`, UNC) are detected identically on every OS.
        const rooted = win32.isAbsolute(segment);
        if(rooted) parts.length = 0;

        const relative = rooted ? segment.replace(DRIVE_PREFIX, "") : segment;
        for(const part of relative.split(SEPARATOR)) {
            if(part === "" || part === ".") continue;
            if(part === "..") {
                parts.pop();
                continue;
            }
            parts.push(part);
        }
    }

    return parts.length === 0 ? base : pathJoin(base, ...parts);
}
