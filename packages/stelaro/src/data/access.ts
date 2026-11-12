import {createFluentPath} from "../fs/path.ts";
import type {FileReader} from "../fs/reader.ts";
import type {FileWriter} from "../fs/writer.ts";

/**
 * File access scoped to an absolute data directory.
 *
 * @remarks
 * Both slash styles separate names. Rooted subpaths start at `dir`, and parent traversal stops there.
 * Symlinks inside the directory can point outside it.
 *
 * @category Data
 */
export type DataAccess = {
    /** The absolute data directory. */
    readonly dir: string;

    /**
     * Resolve a subpath within the data directory without accessing the filesystem.
     *
     * @param subpath - Path to resolve within the data directory
     * @returns An absolute path at or below `dir`
     */
    resolve(subpath: string): string;

    /**
     * Create a reader for a file within the data directory.
     *
     * @param subpath - Path to the file within the data directory
     * @returns A reader that throws for missing files unless optional mode is selected
     */
    read(subpath: string): FileReader;

    /**
     * Create a writer for a file within the data directory.
     *
     * @param subpath - Path to the file within the data directory
     * @returns A writer that creates parent directories when writing
     */
    write(subpath: string): FileWriter;
};

/**
 * Create a scoped data accessor without accessing the filesystem.
 *
 * @param dir - Data directory, relative to the working directory if needed
 * @returns An accessor rooted at the absolute data directory
 *
 * @example
 * ```typescript
 * import {createDataAccess} from "@jiminp/stelaro";
 *
 * const data = createDataAccess("data/cache");
 * const snapshot = await data.read("snapshot.json").optional().json();
 * ```
 *
 * @category Data
 */
export function createDataAccess(dir: string): DataAccess {
    const root = createFluentPath(dir);
    return {
        dir: root.path,
        resolve(subpath) {
            return root.confine(subpath).path;
        },
        read(subpath) {
            return root.confine(subpath).read();
        },
        write(subpath) {
            return root.confine(subpath).write();
        },
    };
}
