import {StelaroError} from "../error.ts";

/**
 * An error raised when a reader encounters a non-regular file.
 *
 * @category Errors
 */
export class NotRegularFileError extends StelaroError {
    /** The path passed to the reader. */
    readonly file_path: string;

    /**
     * Create an error for a non-regular file.
     *
     * @param file_path - Path passed to the reader
     */
    constructor(file_path: string) {
        super(`Not a regular file: ${file_path}`);
        this.file_path = file_path;
    }
}
