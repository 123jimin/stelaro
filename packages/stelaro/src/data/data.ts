import {fluentPath} from "../fs/path.ts";
import type {FileReader} from "../fs/reader.ts";
import type {FileWriter} from "../fs/writer.ts";

/**
 * Provides path resolution and fluent file I/O scoped to a data directory.
 *
 * @category Data
 */
export type DataAccess = {
    /** Resolved absolute path of the data directory */
    readonly dir: string;
    /**
     * Resolves a subpath relative to the data directory.
     *
     * @param subpath - Relative path to resolve
     * @returns Absolute path
     */
    resolve(subpath: string): string;
    /**
     * Returns a {@link FileReader} for a file within the data directory.
     *
     * @param subpath - Relative path to the file
     */
    read(subpath: string): FileReader;
    /**
     * Returns a {@link FileWriter} for a file within the data directory.
     *
     * @param subpath - Relative path to the file
     */
    write(subpath: string): FileWriter;
};

/**
 * Creates a {@link DataAccess} rooted at the given base path.
 *
 * @param base_path - Root directory for data access
 * @returns A new {@link DataAccess} instance
 * @category Data
 */
export function createDataAccess(base_path: string): DataAccess {
    const fp = fluentPath(base_path);
    return {
        dir: fp.path,
        resolve(subpath: string) {
            return fp.join(subpath).path;
        },
        read(subpath: string) {
            return fp.join(subpath).read();
        },
        write(subpath: string) {
            return fp.join(subpath).write();
        },
    };
}
