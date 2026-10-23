import assert from "node:assert/strict";
import {describe, it, type TestContext} from "node:test";

import {defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";

import {CallFailedError, createComponentClientFactory, type ErrorBody, getCallPath, type OutputBody} from "./client.ts";

const ProbeCalls = defineComponentCalls("probe", {
    take: {input: schema("null").or({n: "number"}), output: schema("unknown")},
    list: {input: schema({}), output: schema("unknown")},
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
    it("POSTs JSON to the path callPath returns and resolves to the OutputBody's output", async (t) => {
        const requests = stubFetch(t, () => Response.json({output: {ok: 1}} satisfies OutputBody));
        const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
        assert.deepStrictEqual(await probe("take")({n: 1}), {ok: 1});
        assert.strictEqual(requests.length, 1);
        const [{url, init}] = requests as [RecordedRequest];
        assert.strictEqual(url, "/api/probe/take");
        assert.strictEqual(init.method, "POST");
        assert.strictEqual(new Headers(init.headers).get("content-type"), "application/json");
        assert.strictEqual(init.body, "{\"n\":1}");
    });

    it("sends an explicit null input as null, and an omitted input as {}, and resolves a null output", async (t) => {
        const requests = stubFetch(t, () => Response.json({output: null} satisfies OutputBody));
        const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
        assert.strictEqual(await probe("take")(null), null);
        await probe("list")();
        assert.deepStrictEqual(requests.map(({init}) => init.body), ["null", "{}"]);
    });

    it("types an omitted input as allowed only when the call accepts {}, and requires the call surface type", () => {
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
        for(const body of ["{\"error\":\"Name taken.\"}", "{\"ok\":1}", "null", "\"output\"", "not json"]) {
            stubFetch(t, () => new Response(body, {status: 200}));
            const probe = createComponentClient<typeof ProbeCalls>(ProbeCalls.id);
            await assert.rejects(probe("take")(null), (err: unknown) => err instanceof CallFailedError && err.status === 200 && err.server_message === null, body);
            t.mock.restoreAll();
        }
    });
});
