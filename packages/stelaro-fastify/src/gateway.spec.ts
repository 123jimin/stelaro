import {deepEqual, equal, ok, rejects} from "node:assert/strict";
import type {AddressInfo} from "node:net";
import {test} from "node:test";
import {format} from "node:util";

import type {LoggerFactory} from "@jiminp/stelaro";
import {ConfigValidationError, createApplication, defineComponent, defineComponentCalls, InvalidComponentIdError} from "@jiminp/stelaro";
import {definePinoLogger} from "@jiminp/stelaro-pino";
import {assertEqualType} from "@jiminp/tooltool";
import {type} from "arktype";
import fastify from "fastify";
import pino from "pino";

import type {GatewayHandlerContext} from "./index.ts";
import {defineFastifyGateway, defineFastifyRoute, defineFastifyRoutes} from "./index.ts";
import {createBaseDirectory, writeConfig} from "./test-util.ts";

const threads = defineComponentCalls("threads", {
    get: {input: type({thread_id: "string"}), output: type({title: "string"})},
});
const users = defineComponentCalls("users", {
    name: {input: type("string"), output: type("string")},
});
const threads_component = defineComponent({
    calls: threads,
    uses: [],
    handlers: {get: (_context, {thread_id}) => ({title: `Thread ${thread_id}`})},
});
const users_component = defineComponent({
    calls: users,
    uses: [],
    handlers: {name: (_context, user_id) => `User ${user_id}`},
});

type SiteConfig = {site_name: string};
const SiteConfig = type({"site_name": "string", "+": "reject"});

const thread_routes = defineFastifyRoutes({
    uses: [threads],
    routes: [defineFastifyRoute({
        method: "GET",
        path: "/threads/:thread_id",
        params: type({thread_id: "string"}),
        handle: ({call, params}) => call(threads.calls.get, params),
    })],
});
const user_routes = defineFastifyRoutes({
    uses: [users, threads],
    routes: [{
        method: "GET",
        path: "/users/me",
        async handle(context: GatewayHandlerContext<readonly [typeof users, typeof threads], SiteConfig>) {
            const name = await context.call(users.calls.name, "1");
            return `${name} on ${context.getConfig().site_name}`;
        },
    }],
});

function captureLogs() {
    const records: string[] = [];
    const logger: LoggerFactory = (scope) => ({
        debug() {},
        info(...args) { records.push(`${scope}: ${format(...args)}`); },
        warn() {},
        error() {},
    });
    return {logger, records};
}

function serverUrl(server: {server: {address(): unknown}}, path: string): string {
    const {address, port} = server.server.address() as AddressInfo;
    return `http://${address}:${port}${path}`;
}

test("gateway mounts route groups before listening and closes the server on stop", async (t) => {
    const base_dir = await createBaseDirectory(t);
    await writeConfig(base_dir, "web", `port = 0\nhost = "127.0.0.1"\nsite_name = "Forum"\n`);
    const server = fastify();
    const gateway = defineFastifyGateway({
        id: "web",
        server,
        uses: [threads],
        config: SiteConfig,
        mounts: [thread_routes, user_routes],
        routes: [{
            method: "GET",
            path: "/",
            async handle({call, getConfig}) {
                assertEqualType<typeof getConfig, () => {port: number; host?: string} & SiteConfig>();
                const thread = await call(threads.calls.get, {thread_id: "1"});
                return `${getConfig().site_name}: ${thread.title}`;
            },
        }],
    });
    assertEqualType<typeof gateway.uses, readonly (typeof threads | typeof users)[]>();
    deepEqual(gateway.uses, [threads, users]);
    equal(gateway.calls.id, "web");

    const {logger, records} = captureLogs();
    const app = createApplication({components: [threads_component, users_component, gateway], logger}, {base_dir});
    equal(server.hasRoute({method: "GET", url: "/"}), false);
    await app.start();
    const url = serverUrl(server, "");
    deepEqual(records, [`web: Listening at ${url}.`]);
    equal(await (await fetch(`${url}/`)).text(), "Forum: Thread 1");
    deepEqual(await (await fetch(`${url}/threads/7`)).json(), {title: "Thread 7"});
    equal(await (await fetch(`${url}/users/me`)).text(), "User 1 on Forum");

    await app.stop();
    equal(server.server.listening, false);
    deepEqual(records, [`web: Listening at ${url}.`, "web: Server closed."]);
});

test("handlers read the configuration after a reload while listen settings apply at start only", async (t) => {
    const base_dir = await createBaseDirectory(t);
    await writeConfig(base_dir, "web", `port = 0\nhost = "127.0.0.1"\nsite_name = "first"\n`);
    const server = fastify();
    const gateway = defineFastifyGateway({
        id: "web",
        server,
        uses: [],
        config: SiteConfig,
        routes: [{method: "GET", path: "/", handle: ({getConfig}) => getConfig().site_name}],
    });
    const app = createApplication({components: [gateway], logger: captureLogs().logger}, {base_dir});
    await app.start();
    t.after(() => app.stop());
    const url = serverUrl(server, "/");
    equal(await (await fetch(url)).text(), "first");

    await writeConfig(base_dir, "web", `port = 1\nhost = "127.0.0.1"\nsite_name = "second"\n`);
    await app.reloadConfig();
    equal(serverUrl(server, "/"), url);
    equal(await (await fetch(url)).text(), "second");

    await writeConfig(base_dir, "web", `port = 2\nhost = "127.0.0.1"\nsite_name = "third"\n`);
    await app.reloadComponentConfig("web");
    equal(serverUrl(server, "/"), url);
    equal(await (await fetch(url)).text(), "third");

    // Verify onConfigReload updates getConfig independently of the start context.
    ok(gateway.onConfigReload != null);
    await gateway.onConfigReload({
        log: captureLogs().logger("web"),
        data: app.data,
        call: async () => { throw new Error("unused"); },
        config: {port: 3, site_name: "fourth"},
    });
    equal(await (await fetch(url)).text(), "fourth");
});

test("gateway configuration validates listen settings and passes the other keys to config", async (t) => {
    const base_dir = await createBaseDirectory(t);
    const cases = [
        `port = 0\nsite_name = 3\n`,
        `site_name = "Forum"\n`,
        `port = 70000\nsite_name = "Forum"\n`,
        `port = 0\nhost = 1\nsite_name = "Forum"\n`,
    ];
    for(const content of cases) {
        await writeConfig(base_dir, "web", content);
        const gateway = defineFastifyGateway({id: "web", server: fastify(), uses: [], config: SiteConfig});
        const app = createApplication({components: [gateway], logger: captureLogs().logger}, {base_dir});
        await rejects(app.start(), ConfigValidationError, content);
    }

    await writeConfig(base_dir, "web", `port = 0\nhost = "127.0.0.1"\nextra = true\n`);
    const server = fastify();
    const gateway = defineFastifyGateway({
        id: "web",
        server,
        uses: [],
        routes: [{
            method: "GET",
            path: "/",
            handle({getConfig}) {
                assertEqualType<typeof getConfig, () => {port: number; host?: string}>();
                return getConfig();
            },
        }],
    });
    const app = createApplication({components: [gateway], logger: captureLogs().logger}, {base_dir});
    await app.start();
    t.after(() => app.stop());
    deepEqual(await (await fetch(serverUrl(server, "/"))).json(), {port: 0, host: "127.0.0.1", extra: true});
});

test("requests in flight while the gateway stops can still call dependencies", async (t) => {
    const base_dir = await createBaseDirectory(t);
    await writeConfig(base_dir, "web", `port = 0\nhost = "127.0.0.1"\n`);
    const {promise: entered, resolve: enter} = Promise.withResolvers<void>();
    const {promise: released, resolve: release} = Promise.withResolvers<void>();
    const server = fastify();
    const gateway = defineFastifyGateway({
        id: "web",
        server,
        uses: [threads],
        routes: [{
            method: "GET",
            path: "/",
            async handle({call}) {
                enter();
                await released;
                return call(threads.calls.get, {thread_id: "late"});
            },
        }],
    });
    const app = createApplication({components: [threads_component, gateway], logger: captureLogs().logger}, {base_dir});
    await app.start();
    const response = fetch(serverUrl(server, "/"));
    await entered;
    const stopped = app.stop();
    release();
    deepEqual(await (await response).json(), {title: "Thread late"});
    await stopped;
});

test("gateway types check mounts against the configuration and accept caller-configured servers", () => {
    ok(defineFastifyGateway({id: "web", server: fastify(), uses: [], config: SiteConfig, mounts: [user_routes]}));
    // @ts-expect-error user_routes expects SiteConfig, so the gateway must declare config.
    defineFastifyGateway({id: "web", server: fastify(), uses: [], mounts: [user_routes]});
    // @ts-expect-error user_routes expects site_name on the gateway configuration.
    defineFastifyGateway({id: "web", server: fastify(), uses: [], config: type({title: "string"}), mounts: [user_routes]});
    defineFastifyGateway({
        id: "web",
        server: fastify(),
        uses: [threads],
        routes: [{
            method: "GET",
            path: "/",
            async handle({call}) {
                // @ts-expect-error Gateway routes can only call surfaces in the gateway's uses.
                await call(users.calls.name, "1");
            },
        }],
    });

    const logger = definePinoLogger(pino({enabled: false}));
    const gateway = defineFastifyGateway({id: "web", server: fastify({loggerInstance: logger.childPinoLogger("web")}), uses: []});
    equal(gateway.calls.id, "web");
});

test("gateway IDs follow component ID rules", () => {
    let error: unknown = null;
    try {
        defineFastifyGateway({id: "Web", server: fastify(), uses: []});
    } catch (caught) {
        error = caught;
    }
    ok(error instanceof InvalidComponentIdError);
    equal(error.component_id, "Web");
});
