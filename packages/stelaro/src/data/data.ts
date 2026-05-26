import {fluentPath} from "../fs/path.ts";
import type {FileReader} from "../fs/reader.ts";
import type {FileWriter} from "../fs/writer.ts";

/** @category Data */
export type DataAccess = {
    readonly dir: string;
    resolve(subpath: string): string;
    read(subpath: string): FileReader;
    write(subpath: string): FileWriter;
};

/** @category Data */
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
