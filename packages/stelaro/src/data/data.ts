import {join, resolve} from "node:path";

/** @category Data */
export type DataAccess = {
    readonly dir: string;
    resolve(subpath: string): string;
};

/** @category Data */
export function createDataAccess(base_path: string): DataAccess {
    const dir = resolve(base_path);
    return {
        dir,
        resolve(subpath: string) {
            return join(dir, subpath);
        },
    };
}
