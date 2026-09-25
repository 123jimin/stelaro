import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";
import Fastify, {type FastifyInstance, type InjectOptions} from "fastify";

import {
    defineFastifyGateway,
    defineFastifyRoutes,
    HTML_MEDIA_TYPE,
    mountFastifyRoutes,
    route,
    RouteValidationError,
    UnboundCallError,
} from "./index.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type CapturedRecord = {readonly level: LogLevel; readonly fields: Record<string, unknown>};

/** A fastify stand-in that records listen/close without binding a real port. */
function fakeServer(): FastifyInstance {
    return {
        listen() { return Promise.resolve("http://127.0.0.1:0"); },
        close() { return Promise.resolve(); },
    } as unknown as FastifyInstance;
}

function capturingContext(captured: CapturedRecord[]) {
    const make = (level: LogLevel) => (...args: unknown[]): void => {
        const first = args[0];
        const fields = first !== null && typeof first === "object" && !Array.isArray(first)
            ? first as Record<string, unknown>
            : {};
        captured.push({level, fields});
    };
    return {
        log: {debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error")},
        data: null,
        call: () => Promise.resolve(null),
        config: {port: 0},
    };
}

describe("fastify gateway lifecycle logging", () => {
    it("logs the listening address on start", async () => {
        const captured: CapturedRecord[] = [];
        const gateway = defineFastifyGateway({
            id: "web",
            server: fakeServer(),
            uses: [],
            routes: [],
        });
        const context = capturingContext(captured) as unknown as Parameters<NonNullable<typeof gateway.start>>[0];

        assert.ok(gateway.start);
        await gateway.start(context);

        const listening = captured.find((record) =>
            record.level === "info" && record.fields["event"] === "gateway.listening");
        assert.ok(listening, "expected a gateway.listening info record");
        assert.deepStrictEqual(typeof listening.fields["address"], "string");
    });

    it("logs the server close on stop", async () => {
        const captured: CapturedRecord[] = [];
        const gateway = defineFastifyGateway({
            id: "web",
            server: fakeServer(),
            uses: [],
            routes: [],
        });
        const context = capturingContext(captured) as unknown as Parameters<NonNullable<typeof gateway.stop>>[0];

        assert.ok(gateway.stop);
        await gateway.stop(context);

        const closed = captured.find((record) =>
            record.level === "info" && record.fields["event"] === "gateway.closed");
        assert.ok(closed, "expected a gateway.closed info record");
    });
});

describe("mountFastifyRoutes", () => {
    const ROUTES = defineFastifyRoutes({
        uses: [],
        routes: [
            route({
                method: "POST",
                path: "/echo/:id",
                params: schema({id: "string.numeric.parse"}),
                body: schema({name: "string"}),
                handle: ({params, body}) => ({params, body}),
            }),
            route({
                method: "GET",
                path: "/search",
                querystring: schema({n: "string.numeric.parse"}),
                handle: ({querystring}) => querystring,
            }),
            route({method: "GET", path: "/page", handle({html}) { html("<p>hi</p>"); }}),
        ],
    });

    /** A server with `mount` applied, whose error handler records each thrown error. */
    async function serve(mount: (server: FastifyInstance) => void) {
        const errors: unknown[] = [];
        // eslint-disable-next-line new-cap -- Fastify's public API
        const server = Fastify();
        server.setErrorHandler((error: {statusCode?: number}, _request, reply) => {
            errors.push(error);
            reply.status(error.statusCode ?? 500).send({});
        });
        mount(server);
        await server.ready();
        return {server, errors};
    }

    it("hands the schemas' parsed params, body, and querystring to the handler", async () => {
        const {server} = await serve((s) => mountFastifyRoutes(s, ROUTES));
        const echoed = await server.inject({method: "POST", url: "/echo/7", payload: {name: "a"}});
        assert.strictEqual(echoed.statusCode, 200);
        assert.deepStrictEqual(echoed.json(), {params: {id: 7}, body: {name: "a"}});
        assert.deepStrictEqual((await server.inject({method: "GET", url: "/search?n=3"})).json(), {n: 3});
        await server.close();
    });

    it("throws a 400 RouteValidationError naming the part that failed its schema", async () => {
        const {server, errors} = await serve((s) => mountFastifyRoutes(s, ROUTES));
        const cases: readonly (readonly [InjectOptions, string])[] = [
            [{method: "POST", url: "/echo/x", payload: {name: "a"}}, "params"],
            [{method: "POST", url: "/echo/7", payload: {name: 1}}, "body"],
            [{method: "GET", url: "/search?n=x"}, "querystring"],
        ];
        for(const [request, part] of cases) {
            const url = String(request.url);
            const response = await server.inject(request);
            assert.strictEqual(response.statusCode, 400, url);
            const error = errors.at(-1);
            assert.ok(error instanceof RouteValidationError, url);
            assert.strictEqual(error.validationContext, part, url);
            assert.ok(error.cause instanceof Error, url);
        }
        await server.close();
    });

    it("sends html() as HTML_MEDIA_TYPE", async () => {
        const {server} = await serve((s) => mountFastifyRoutes(s, ROUTES));
        const page = await server.inject({method: "GET", url: "/page"});
        assert.strictEqual(page.headers["content-type"], HTML_MEDIA_TYPE);
        assert.strictEqual(page.body, "<p>hi</p>");
        await server.close();
    });

    it("rejects call() with an UnboundCallError naming the call when types are bypassed to omit `call`", async () => {
        const COUNTER = defineComponentCalls("counter", {current: {input: schema({}), output: schema({count: "number"})}});
        const calling = defineFastifyRoutes({
            uses: [COUNTER],
            routes: [route({method: "GET", path: "/call", handle: ({call}) => call(COUNTER.calls.current, {})})],
        });
        // The types require `call` for a group that uses a component; bypass them to omit it.
        // @ts-expect-error -- a group that uses a component needs `call`
        const {server, errors} = await serve((s) => mountFastifyRoutes(s, calling));
        assert.strictEqual((await server.inject({method: "GET", url: "/call"})).statusCode, 500);
        const [error] = errors;
        assert.ok(error instanceof UnboundCallError);
        assert.deepStrictEqual([error.component_id, error.call_name], ["counter", "current"]);
        await server.close();
    });
});
