import assert from "node:assert/strict";
import {once} from "node:events";
import {extname} from "node:path";
import {describe, it, type TestContext} from "node:test";
import {fileURLToPath} from "node:url";
import {Worker} from "node:worker_threads";

import {defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";

import {CallFailedError, createComponentClientFactory, type ErrorBody, getCallPath, isErrorBody, type OutputBody} from "./client.ts";

const ProbeCalls = defineComponentCalls("probe", {
    take: {input: schema("null").or({n: "number"}), output: schema("unknown")},
    list: {input: schema({}), output: schema("unknown")},
    count: {input: schema({}), output: schema({count: "number"})},
});

const createComponentClient = createComponentClientFactory({callPath: (reference) => getCallPath("/api", reference)});

type RecordedRequest = {readonly url: string; readonly init: RequestInit};

/** Replaces `fetch` with one answering `response` and recording each request. */
function stubFetch(t: TestContext, response: () => Response): RecordedRequest[] {
    const requests: RecordedRequest[] = [];
    t.mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
        requests.push({url, init});
        return Promise.resolve(response());
    });
    return requests;
}

describe("createComponentClientFactory", () => {
    it("POSTs the input as JSON to the path callPath returns and resolves to the OutputBody's output", async (t) => {
        const requests = stubFetch(t, () => Response.json({output: {ok: 1}} satisfies OutputBody));
        const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
        assert.deepStrictEqual(await probe("take")({n: 1}), {ok: 1});
        assert.strictEqual(requests.length, 1);
        const [{url, init}] = requests as [RecordedRequest];
        assert.strictEqual(url, "/api/probe/take");
        assert.strictEqual(init.method, "POST");
        assert.strictEqual(new Headers(init.headers).get("content-type")?.split(";")[0]?.trim(), "application/json");
        assert.deepStrictEqual(JSON.parse(String(init.body)), {n: 1});
    });

    it("sends null input as null and omitted input as {}, and resolves a null output", async (t) => {
        const requests = stubFetch(t, () => Response.json({output: null} satisfies OutputBody));
        const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
        assert.strictEqual(await probe("take")(null), null);
        await probe("list")();
        assert.deepStrictEqual(requests.map(({init}) => JSON.parse(String(init.body)) as unknown), [null, {}]);
    });

    it("resolves an output without validating it against the call's output schema", async (t) => {
        stubFetch(t, () => Response.json({output: "not a count"} satisfies OutputBody));
        const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
        assert.strictEqual(await probe("count")(), "not a count");
    });

    it("allows omitting the input only for calls that accept {}, and requires the call surface type argument", () => {
        const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
        // @ts-expect-error -- `take` does not accept `{}`, so its input is required
        assert.ok(() => probe("take")());
        // @ts-expect-error -- the call surface type must be given
        assert.ok(() => createComponentClient("probe")("take"));
    });

    it("rejects a non-OK response with its status and the ErrorBody's message", async (t) => {
        stubFetch(t, () => Response.json({error: "Name taken."} satisfies ErrorBody, {status: 409}));
        const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
        await assert.rejects(probe("take")({n: 1}), (err: unknown) => {
            assert.ok(err instanceof CallFailedError);
            assert.strictEqual(err.status, 409);
            assert.strictEqual(err.server_message, "Name taken.");
            return true;
        });
    });

    it("gives no server message when the error body is not an ErrorBody", async (t) => {
        for(const body of ["<html>bad gateway</html>", "{\"error\":1}", "null", ""]) {
            stubFetch(t, () => new Response(body, {status: 502}));
            const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
            await assert.rejects(probe("take")(null), (err: unknown) => err instanceof CallFailedError && err.status === 502 && err.server_message === null, body);
            t.mock.restoreAll();
        }
    });

    it("rejects an OK response that is not an OutputBody, even an ErrorBody", async (t) => {
        const cases = [
            ["{\"error\":\"Name taken.\"}", 200], ["{\"ok\":1}", 200], ["null", 200], ["\"output\"", 200], ["[]", 200], ["not json", 200], [null, 204],
        ] as const;
        for(const [body, status] of cases) {
            stubFetch(t, () => new Response(body, {status}));
            const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
            await assert.rejects(probe("take")(null), (err: unknown) => err instanceof CallFailedError && err.status === status && err.server_message === null, String(body));
            t.mock.restoreAll();
        }
    });
});

describe("getCallPath", () => {
    it("joins base, component id, and call name with slashes", () => {
        assert.strictEqual(getCallPath("/api", {component_id: "probe", name: "take"}), "/api/probe/take");
        assert.strictEqual(getCallPath("/api/v1", {component_id: "a-b", name: "get_info"}), "/api/v1/a-b/get_info");
    });

    it("escapes neither the component id nor the call name", () => {
        assert.strictEqual(getCallPath("/api", {component_id: "a b%", name: "é/?#"}), "/api/a b%/é/?#");
    });
});

describe("isErrorBody", () => {
    it("accepts an object whose error is a string", () => {
        assert.ok(isErrorBody({error: "Name taken."}));
        assert.ok(isErrorBody({error: ""}));
        assert.ok(isErrorBody({error: "Name taken.", detail: 1}));
    });

    it("rejects values without a string error", () => {
        for(const body of [null, "error", 1, [], {}, {error: 1}, {error: null}, {message: "Name taken."}, ["Name taken."]]) {
            assert.ok(!isErrorBody(body), JSON.stringify(body));
        }
    });
});

// A worker's module cache starts empty, so the hook sees every module the entry's graph resolves.
const RESOLVE_RECORDER = new URL(`data:text/javascript,${encodeURIComponent(`
import {registerHooks} from "node:module";
import {parentPort, workerData} from "node:worker_threads";
const resolved = [];
registerHooks({
    resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);
        resolved.push(specifier, result.url);
        return result;
    },
});
const entry = await import(workerData.entry_url);
parentPort.postMessage({resolved, exports: Object.keys(entry)});
`)}`);

describe("client entry", () => {
    it("loads neither Fastify nor stelaro at runtime", async (t) => {
        const extension = extname(fileURLToPath(import.meta.url));
        const entry_url = new URL(`./client${extension}`, import.meta.url).href;
        const index_url = new URL(`./index${extension}`, import.meta.url).href;
        const worker = new Worker(RESOLVE_RECORDER, {workerData: {entry_url}});
        t.after(() => worker.terminate());
        const [{resolved, exports}] = await once(worker, "message") as [{resolved: string[]; exports: string[]}];
        assert.ok(exports.includes("createComponentClientFactory"));
        const forbidden = resolved.filter((name) => /^(?:fastify|@jiminp\/stelaro)(?:\/|$)/u.test(name) || /\/node_modules\/(?:fastify|@jiminp\/stelaro)\//u.test(name) || name === index_url);
        assert.deepStrictEqual(forbidden, []);
    });
});
