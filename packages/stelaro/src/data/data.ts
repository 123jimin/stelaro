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
     * Resolves a subpath confined to {@link DataAccess.dir} using {@link FluentPath.confine}.
     *
     * @param subpath - Path to resolve within the data directory
     * @returns Absolute path at the data directory or one of its descendants
     */
    resolve(subpath: string): string;
    /**
     * Creates a reader for a file within the data directory.
     *
     * @param subpath - Path to the file within the data directory
     * @returns A {@link FileReader} for the confined path
     */
    read(subpath: string): FileReader;
    /**
     * Creates a writer for a file within the data directory.
     *
     * @param subpath - Path to the file within the data directory
     * @returns A {@link FileWriter} for the confined path
     */
    write(subpath: string): FileWriter;
};

export function createDataAccess(base_path: string): DataAccess {
    const fp = fluentPath(base_path);
    return {
        dir: fp.path,
        resolve(subpath: string) {
            return fp.confine(subpath).path;
        },
        read(subpath: string) {
            return fp.confine(subpath).read();
        },
        write(subpath: string) {
            return fp.confine(subpath).write();
        },
    };
}
