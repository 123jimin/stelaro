import {appendFile, mkdir, readFile} from "node:fs/promises";
import {dirname} from "node:path";

export async function readJsonl<T>(path: string): Promise<T[]> {
    let content: string;
    try {
        content = await readFile(path, "utf-8");
    } catch (error) {
        if((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        throw error;
    }
    return content
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as T);
}

export async function appendJsonl<T>(path: string, record: T): Promise<void> {
    await mkdir(dirname(path), {recursive: true});
    await appendFile(path, JSON.stringify(record) + "\n", "utf-8");
}
