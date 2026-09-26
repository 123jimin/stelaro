import assert from "node:assert/strict";
import {describe, it, type TestContext} from "node:test";

import {defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";
import Fastify, {type FastifyInstance, type FastifyListenOptions, type InjectOptions} from "fastify";

import {
    defineFastifyGateway,
    defineFastifyRoute,
    defineFastifyRoutes,
    HTML_MEDIA_TYPE,
    mountFastifyRoutes,
    RouteValidationError,
    UnboundCallError,
} from "./index.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type CapturedRecord = {readonly level: LogLevel; readonly fields: Record<string, unknown>};
type RecordedCall = readonly [reference: unknown, input: unknown];

const CounterCalls = defineComponentCalls("counter", {
    current: {input: schema({}), output: schema({count: "number"})},
});
const GreeterCalls = defineComponentCalls("greeter", {
    greet: {input: schema({name: "string"}), output: schema("string")},
});

const listen_address = "http://127.0.0.1:0";

/** A Fastify stand-in that records `listen` options and `close` calls without binding a port. */
function fakeServer() {
    const recorded = {listen_options: [] as FastifyListenOptions[], close_count: 0};
    const server = {
        listen(options: FastifyListenOptions) {
            recorded.listen_options.push(options);
            return Promise.resolve(listen_address);
        },
        close() {
            recorded.close_count++;
            return Promise.resolve();
        },
    } as unknown as FastifyInstance;
    return {server, recorded};
}

/** A gateway context whose logger captures records and whose `call` records its arguments. */
function recordingContext(config: {port: number; host?: string}, answer: (reference: unknown) => unknown = () => null) {
    const captured: CapturedRecord[] = [];
    const calls: RecordedCall[] = [];
    const make = (level: LogLevel) => (...args: unknown[]): void => {
        const first = args[0];
        const fields = first !== null && typeof first === "object" && !Array.isArray(first)
            ? first as Record<string, unknown>
            : {};
        captured.push({level, fields});
    };
    const context = {
        log: {debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error")},
        data: null,
        call: (reference: unknown, input: unknown) => {
            calls.push([reference, input]);
            return Promise.resolve(answer(reference));
        },
        config,
    };
    return {context, captured, calls};
}

function lifecycleContext<T>(context: unknown): T {
    return context as T;
}

describe("defineFastifyGateway", () => {
    it("listens on the configured port and host, and logs the address listen returned", async () => {
        const {server, recorded} = fakeServer();
        const gateway = defineFastifyGateway({id: "web", server, uses: []});
        const {context, captured} = recordingContext({port: 8080, host: "127.0.0.1"});

        assert.ok(gateway.start);
        await gateway.start(lifecycleContext(context));

        assert.deepStrictEqual(recorded.listen_options, [{port: 8080, host: "127.0.0.1"}]);
        assert.ok(captured.some((record) =>
            record.level === "info" && Object.values(record.fields).includes(listen_address)));
    });

    it("omits host from the listen options when config has none", async () => {
        const {server, recorded} = fakeServer();
        const gateway = defineFastifyGateway({id: "web", server, uses: []});

        assert.ok(gateway.start);
        await gateway.start(lifecycleContext(recordingContext({port: 8080}).context));

        assert.deepStrictEqual(recorded.listen_options, [{port: 8080}]);
    });

    it("closes the server on stop and logs it at info", async () => {
        const {server, recorded} = fakeServer();
        const gateway = defineFastifyGateway({id: "web", server, uses: []});
        const {context, captured} = recordingContext({port: 8080});

        assert.ok(gateway.stop);
        await gateway.stop(lifecycleContext(context));

        assert.strictEqual(recorded.close_count, 1);
        assert.ok(captured.some((record) => record.level === "info"));
    });

    it("mounts its routes and every mount with the component's call, over deduplicated uses", async (t) => {
        const counter_routes = defineFastifyRoutes({
            uses: [CounterCalls],
            routes: [{method: "GET", path: "/count", handle: ({call}) => call(CounterCalls.calls.current, {})}],
        });
        const greeter_routes = defineFastifyRoutes({
            uses: [CounterCalls, GreeterCalls],
            routes: [defineFastifyRoute({
                method: "POST",
                path: "/greet",
                body: schema({name: "string"}),
                handle: ({call, body}) => call(GreeterCalls.calls.greet, body),
            })],
        });
        // eslint-disable-next-line new-cap -- Fastify's public API
        const server = Fastify();
        t.after(() => server.close());
        const gateway = defineFastifyGateway({
            id: "web",
            server,
            uses: [CounterCalls],
            mounts: [counter_routes, greeter_routes],
            routes: [{method: "GET", path: "/", handle: ({call}) => call(CounterCalls.calls.current, {})}],
        });
        assert.strictEqual(gateway.uses.length, 2);
        assert.deepStrictEqual(new Set(gateway.uses), new Set([CounterCalls, GreeterCalls]));

        const {context, calls} = recordingContext(
            {port: 0, host: "127.0.0.1"},
            (reference) => reference === GreeterCalls.calls.greet ? "hello" : {count: 3},
        );
        assert.ok(gateway.start);
        await gateway.start(lifecycleContext(context));

        assert.deepStrictEqual((await server.inject({method: "GET", url: "/"})).json(), {count: 3});
        assert.deepStrictEqual((await server.inject({method: "GET", url: "/count"})).json(), {count: 3});
        const greeted = await server.inject({method: "POST", url: "/greet", payload: {name: "a"}});
        assert.strictEqual(greeted.body, "hello");
        assert.deepStrictEqual(calls, [
            [CounterCalls.calls.current, {}],
            [CounterCalls.calls.current, {}],
            [GreeterCalls.calls.greet, {name: "a"}],
        ]);
    });
});

describe("handler call typing", () => {
    it("rejects inline handler calls outside `uses` at the type level", () => {
        defineFastifyRoutes({
            uses: [CounterCalls],
            routes: [{
                method: "GET",
                path: "/",
                handle: ({call}) =>
                    // @ts-expect-error -- GreeterCalls is not in the group's `uses`
                    call(GreeterCalls.calls.greet, {name: "a"}),
            }],
        });
        defineFastifyGateway({
            id: "web",
            server: fakeServer().server,
            uses: [CounterCalls],
            routes: [{
                method: "GET",
                path: "/",
                handle: ({call}) =>
                    // @ts-expect-error -- GreeterCalls is not in the gateway's `uses`
                    call(GreeterCalls.calls.greet, {name: "a"}),
            }],
        });
    });
});

describe("mountFastifyRoutes", () => {
    const echo_routes = defineFastifyRoutes({
        uses: [],
        routes: [
            defineFastifyRoute({
                method: "POST",
                path: "/echo/:id",
                params: schema({id: "string.numeric.parse"}),
                body: schema({name: "string"}),
                handle: ({params, body}) => ({params, body}),
            }),
            defineFastifyRoute({
                method: "GET",
                path: "/search",
                querystring: schema({n: "string.numeric.parse"}),
                handle: ({querystring}) => querystring,
            }),
            {
                method: "POST",
                path: "/raw/:id",
                handle: ({params, body, querystring}) => ({params, body, querystring}),
            },
            {method: "GET", path: "/page", handle({html}) { html("<p>hi</p>"); }},
            {method: "GET", path: "/go", handle({redirect}) { redirect("/page"); }},
            {
                method: "GET",
                path: "/options",
                preHandler: async (_request, reply) => { reply.header("x-pre-handler", "ran"); },
                schema: {response: {200: {type: "object", properties: {kept: {type: "string"}}}}},
                handle: () => ({kept: "yes", dropped: "no"}),
            },
        ],
    });

    /** A ready server with `mount` applied, closed after the test; `errors` records thrown errors
     *  unless `default_errors` keeps Fastify's own error handler. */
    async function serve(t: TestContext, mount: (server: FastifyInstance) => void, default_errors = false) {
        const errors: unknown[] = [];
        // eslint-disable-next-line new-cap -- Fastify's public API
        const server = Fastify();
        t.after(() => server.close());
        if(!default_errors) {
            server.setErrorHandler((error: {statusCode?: number}, _request, reply) => {
                errors.push(error);
                reply.status(error.statusCode ?? 500).send({});
            });
        }
        mount(server);
        await server.ready();
        return {server, errors};
    }

    it("hands the schemas' parsed params, body, and querystring to the handler", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const echoed = await server.inject({method: "POST", url: "/echo/7", payload: {name: "a"}});
        assert.strictEqual(echoed.statusCode, 200);
        assert.deepStrictEqual(echoed.json(), {params: {id: 7}, body: {name: "a"}});
        assert.deepStrictEqual((await server.inject({method: "GET", url: "/search?n=3"})).json(), {n: 3});
    });

    it("hands null for request parts the route declares no schema for", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const raw = await server.inject({method: "POST", url: "/raw/7?n=3", payload: {name: "a"}});
        assert.deepStrictEqual(raw.json(), {params: null, body: null, querystring: null});
    });

    it("throws a 400 RouteValidationError naming the part that failed its schema", async (t) => {
        const {server, errors} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const cases: readonly (readonly [InjectOptions, string])[] = [
            [{method: "POST", url: "/echo/x", payload: {name: "a"}}, "params"],
            [{method: "POST", url: "/echo/7", payload: {name: 1}}, "body"],
            [{method: "GET", url: "/search?n=x"}, "querystring"],
        ];
        for(const [request, part] of cases) {
            const url = String(request.url);
            const error_count = errors.length;
            const response = await server.inject(request);
            assert.strictEqual(response.statusCode, 400, url);
            assert.strictEqual(errors.length, error_count + 1, url);
            const error = errors.at(-1);
            assert.ok(error instanceof RouteValidationError, url);
            assert.strictEqual(error.validationContext, part, url);
            assert.ok(error.cause instanceof Error, url);
        }
    });

    it("answers a failed validation with Fastify's default 400 body without a custom error handler", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes), true);
        const response = await server.inject({method: "POST", url: "/echo/x", payload: {name: "a"}});
        assert.strictEqual(response.statusCode, 400);
        const body = response.json<{statusCode: unknown; error: unknown; message: unknown}>();
        assert.strictEqual(body.statusCode, 400);
        assert.strictEqual(body.error, "Bad Request");
        assert.strictEqual(typeof body.message, "string");
    });

    it("forwards other RouteOptions to Fastify", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const response = await server.inject({method: "GET", url: "/options"});
        assert.strictEqual(response.headers["x-pre-handler"], "ran");
        assert.deepStrictEqual(response.json(), {kept: "yes"});
    });

    it("sends html() as HTML_MEDIA_TYPE", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const page = await server.inject({method: "GET", url: "/page"});
        assert.strictEqual(page.headers["content-type"], HTML_MEDIA_TYPE);
        assert.strictEqual(page.body, "<p>hi</p>");
    });

    it("sends a redirect from redirect()", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const response = await server.inject({method: "GET", url: "/go"});
        assert.ok(response.statusCode >= 300 && response.statusCode < 400, String(response.statusCode));
        assert.strictEqual(response.headers.location, "/page");
    });

    it("serves handler calls through the `call` option", async (t) => {
        const counter_routes = defineFastifyRoutes({
            uses: [CounterCalls],
            routes: [{method: "GET", path: "/count", handle: ({call}) => call(CounterCalls.calls.current, {})}],
        });
        const calls: RecordedCall[] = [];
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, counter_routes, {
            call: (reference, input) => {
                calls.push([reference, input]);
                return Promise.resolve({count: 3});
            },
        }));
        assert.deepStrictEqual((await server.inject({method: "GET", url: "/count"})).json(), {count: 3});
        assert.deepStrictEqual(calls, [[CounterCalls.calls.current, {}]]);
    });

    it("rejects call() with an UnboundCallError naming the call when types are bypassed to omit `call`", async (t) => {
        const calling = defineFastifyRoutes({
            uses: [CounterCalls],
            routes: [{method: "GET", path: "/call", handle: ({call}) => call(CounterCalls.calls.current, {})}],
        });
        // @ts-expect-error -- a group that uses a component needs `call`
        const {server, errors} = await serve(t, (s) => mountFastifyRoutes(s, calling));
        assert.strictEqual((await server.inject({method: "GET", url: "/call"})).statusCode, 500);
        const [error] = errors;
        assert.ok(error instanceof UnboundCallError);
        assert.deepStrictEqual([error.component_id, error.call_name], ["counter", "current"]);
    });
});
