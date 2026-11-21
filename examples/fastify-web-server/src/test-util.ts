import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {TestContext} from "node:test";

import type {LoggerFactory} from "@jiminp/stelaro";
import {createApplication, defineApplication} from "@jiminp/stelaro";

import {comments_component} from "./comments.ts";
import {threads_component} from "./threads.ts";
import {users_component} from "./users.ts";

const quietLogger: LoggerFactory = () => ({debug() {}, info() {}, warn() {}, error() {}});

const domain_app = defineApplication({
    components: [users_component, threads_component, comments_component],
    logger: quietLogger,
});

/** Create a temporary directory removed during test teardown. */
export async function createTemporaryDirectory(t: TestContext): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "stelaro-fastify-example-"));
    t.after(() => rm(directory, {recursive: true, force: true}));
    return directory;
}

/** Start a fresh application instance rooted at `data_dir` and stop it on test teardown. */
export async function startDomainApplication(t: TestContext, data_dir: string) {
    const app = createApplication(domain_app, {data_dir});
    await app.start();
    let stopped = false;
    t.after(async () => {
        if(!stopped) {
            await app.stop();
        }
    });
    return {
        app,
        async stop() {
            stopped = true;
            await app.stop();
        },
    };
}

/** Read raw non-empty JSONL lines from a file on disk. */
export async function readRawJsonlLines(file_path: string): Promise<string[]> {
    const text = await readFile(file_path, "utf8");
    return text.split(/\r?\n/u).filter((line) => line.length > 0);
}
