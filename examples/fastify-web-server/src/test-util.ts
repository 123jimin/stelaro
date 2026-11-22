import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import type {AddressInfo} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {TestContext} from "node:test";

import type {LoggerFactory} from "@jiminp/stelaro";
import {createApplication, defineApplication} from "@jiminp/stelaro";
import {definePinoLogger} from "@jiminp/stelaro-pino";
import pino from "pino";

import {createBbsApplication} from "./app.ts";
import {comments_component} from "./comments.ts";
import {threads_component} from "./threads/index.ts";
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

/** Start a fresh domain-only application instance rooted at `data_dir` and stop it on test teardown. */
export async function startDomainApplication(t: TestContext, data_dir: string) {
    const app = createApplication(domain_app, {data_dir, validate_call_input: true});
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

/** Write `web.toml` under `config_dir` for the gateway component. */
export async function writeWebConfig(config_dir: string, site_title = "Test BBS"): Promise<void> {
    await mkdir(config_dir, {recursive: true});
    await writeFile(
        join(config_dir, "web.toml"),
        `port = 0\nhost = "127.0.0.1"\nsite_title = ${JSON.stringify(site_title)}\n`,
        "utf8",
    );
}

/** Start a full BBS HTTP application on an ephemeral loopback port and stop it on test teardown. */
export async function startBbsApplication(t: TestContext, base_dir: string, site_title = "Test BBS") {
    const config_dir = join(base_dir, "config");
    const data_dir = join(base_dir, "data");
    await writeWebConfig(config_dir, site_title);
    const {app, server, passport} = createBbsApplication({
        application_options: {base_dir, config_dir, data_dir},
        logger: definePinoLogger(pino({level: "silent"})),
    });
    await app.start();
    let stopped = false;
    t.after(async () => {
        if(!stopped) {
            await app.stop();
        }
    });
    const address = server.server.address() as AddressInfo;
    const base_url = `http://${address.address}:${address.port}`;
    return {
        app,
        server,
        passport,
        base_url,
        config_dir,
        data_dir,
        async stop() {
            stopped = true;
            await app.stop();
        },
    };
}

/** Extract a `Cookie` header value from a `fetch` response's `Set-Cookie` headers. */
export function extractCookieHeader(response: Response): string {
    const cookies = response.headers.getSetCookie();
    return cookies
        .map((header) => header.split(";", 1)[0] ?? "")
        .filter((pair) => pair.length > 0)
        .join("; ");
}

/** Read raw non-empty JSONL lines from a file on disk. */
export async function readRawJsonlLines(file_path: string): Promise<string[]> {
    const text = await readFile(file_path, "utf8");
    return text.split(/\r?\n/u).filter((line) => line.length > 0);
}
