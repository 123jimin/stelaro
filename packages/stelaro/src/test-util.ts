import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";

import {type as schema} from "arktype";

export const EmptyInput = schema({});
export const CounterOutput = schema({count: "number"});
export const SetCounterInput = schema({count: "number"});
export const RenderOutput = schema({html: "string"});

export function createTempDir(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), `stelaro-${prefix}-`));
}

export async function writeTestFile(file_path: string, content: string): Promise<void> {
    await mkdir(dirname(file_path), {recursive: true});
    await writeFile(file_path, content);
}
