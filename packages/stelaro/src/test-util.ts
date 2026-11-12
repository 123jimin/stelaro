import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {TestContext} from "node:test";

import {fluentPath} from "./fs/path.js";

/** Create a temporary directory and remove it during test teardown. */
export async function createTemporaryDirectory(t: TestContext) {
    const directory = await mkdtemp(join(tmpdir(), "stelaro-"));
    t.after(() => rm(directory, {recursive: true, force: true}));
    return fluentPath(directory);
}
