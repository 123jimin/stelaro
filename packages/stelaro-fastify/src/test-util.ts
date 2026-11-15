import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {TestContext} from "node:test";

/** Create a temporary application base directory and remove it during test teardown. */
export async function createBaseDirectory(t: TestContext): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "stelaro-fastify-"));
    t.after(() => rm(directory, {recursive: true, force: true}));
    await mkdir(join(directory, "config"));
    return directory;
}

/** Write a component's base configuration file. */
export function writeConfig(base_dir: string, component_id: string, content: string): Promise<void> {
    return writeFile(join(base_dir, "config", `${component_id}.toml`), content);
}
