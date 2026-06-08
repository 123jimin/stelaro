import {appendFile, mkdir} from "node:fs/promises";
import {dirname} from "node:path";

import type {DataAccess} from "@jiminp/stelaro";

export async function readJsonl<T>(data: DataAccess, subpath: string): Promise<T[]> {
    const content = await data.read(subpath).optional().text();
    if(content == null) {
        return [];
    }
    return content
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as T);
}

export async function appendJsonl<T>(data: DataAccess, subpath: string, record: T): Promise<void> {
    const path = data.resolve(subpath);
    await mkdir(dirname(path), {recursive: true});
    await appendFile(path, JSON.stringify(record) + "\n", "utf-8");
}
