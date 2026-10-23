import {StelaroError} from "../error.ts";

/**
 * Thrown when a read finds something other than a regular file at its path, such as a directory,
 * a FIFO, or a device. A symlink counts as the file it points to.
 *
 * @category Errors
 */
export class NotRegularFileError extends StelaroError {
    /** Path of the file that was read */
    readonly file_path: string;

    constructor(file_path: string) {
        super(`Not a regular file: ${file_path}`);
        this.file_path = file_path;
    }
}
