import {appendFile, mkdir} from "node:fs/promises";
import {dirname} from "node:path";

import type {DataAccess} from "@jiminp/stelaro";
import {type} from "arktype";

export const NonEmptyString = type("string > 0");
export const TrimmedNonEmptyString = type("string.trim").to("string > 0");
export const NonBlankString = type("string").narrow((value, ctx) => value.trim().length > 0 || ctx.mustBe("a non-blank string"));
export const IsoTimestamp = type("string.date.iso");

export type WriteQueue = <T>(operation: () => Promise<T>) => Promise<T>;

/** Serialize asynchronous file mutations within a component without caching records. */
export function createWriteQueue(): WriteQueue {
    let pending: Promise<unknown> = Promise.resolve();
    return <T>(operation: () => Promise<T>): Promise<T> => {
        const run = pending.then(() => operation());
        pending = run.catch(() => null);
        return run;
    };
}

/** Read and validate all JSONL records from a component-scoped file without caching. */
export async function readJsonlRecords<TSchema extends type.Any>(
    data: DataAccess,
    file_name: string,
    schema: TSchema,
): Promise<TSchema["infer"][]> {
    const content = await data.read(file_name).optional().text();
    if(content == null) {
        return [];
    }
    const records: TSchema["infer"][] = [];
    for(const line of content.split(/\r?\n/u)) {
        if(line.trim().length === 0) {
            continue;
        }
        const parsed: unknown = JSON.parse(line);
        records.push(schema.assert(parsed));
    }
    return records;
}

/** Validate and append one JSONL record to a component-scoped file. */
export async function appendJsonlRecord<TSchema extends type.Any>(
    data: DataAccess,
    file_name: string,
    schema: TSchema,
    record: TSchema["infer"],
): Promise<void> {
    const validated = schema.assert(record);
    const file_path = data.resolve(file_name);
    await mkdir(dirname(file_path), {recursive: true});
    await appendFile(file_path, `${JSON.stringify(validated)}\n`, "utf8");
}
