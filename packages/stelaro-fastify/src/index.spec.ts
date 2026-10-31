import assert from "node:assert/strict";
import {describe, it, type TestContext} from "node:test";

import {CallInputError, createApplication, defineComponent, defineComponentCalls, defineLocalInput, defineLocalOutput, type Logger} from "@jiminp/stelaro";
import {TraversalError, type as schema} from "arktype";
import Fastify, {type FastifyInstance, type FastifyListenOptions, type InjectOptions} from "fastify";

import {type CallEndpointReference, CallFailedError, createComponentClientFactory, type ErrorBody, type OutputBody} from "./client.ts";
import {
    createExposeCallsFactory,
    defineFastifyGateway,
    defineFastifyRoute,
    defineFastifyRoutes,
    type GatewayHandlerContext,
    HTML_MEDIA_TYPE,
    InvalidCallEndpointError,
    mountFastifyRoutes,
    NotFoundError,
    RouteValidationError,
    sendHtml,
    UnboundCallError,
    UnboundConfigError,
} from "./index.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type CapturedRecord = {readonly level: LogLevel; readonly args: readonly unknown[]};
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
function recordingContext(config: {port: number; host?: string; [key: string]: unknown}, answer: (reference: unknown) => unknown = () => null) {
    const captured: CapturedRecord[] = [];
    const calls: RecordedCall[] = [];
    const make = (level: LogLevel) => (...args: unknown[]): void => {
        captured.push({level, args});
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
        assert.ok(captured.some((record) => record.level === "info" && JSON.stringify(record.args).includes(listen_address)));
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

    it("mounts its own and every mount's routes before listening, and deduplicates their uses", async (t) => {
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
        const routes_at_listen: boolean[] = [];
        t.mock.method(server, "listen", () => {
            routes_at_listen.push(
                server.hasRoute({method: "GET", url: "/"}),
                server.hasRoute({method: "GET", url: "/count"}),
                server.hasRoute({method: "POST", url: "/greet"}),
            );
            return Promise.resolve(listen_address);
        });
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
        assert.deepStrictEqual(routes_at_listen, [true, true, true]);

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

    const CountConfig = schema({count: "string.numeric.parse"});
    type CountContext = GatewayHandlerContext<readonly [], typeof CountConfig.infer>;
    const count_routes = defineFastifyRoutes({
        uses: [],
        routes: [{method: "GET", path: "/count", handle: (context: CountContext) => ({count: context.getConfig().count})}],
    });

    it("validates the listen settings and `config`'s keys", () => {
        const BareConfig = defineFastifyGateway({id: "web", server: fakeServer().server, uses: []}).config;
        assert.ok(BareConfig);
        assert.deepStrictEqual(BareConfig.assert({port: 8080, host: "127.0.0.1"}), {port: 8080, host: "127.0.0.1"});
        assert.throws(() => BareConfig.assert({host: "127.0.0.1"}));
        assert.throws(() => BareConfig.assert({port: "8080"}));
        assert.throws(() => BareConfig.assert({port: 8080, host: 1}));
        const CountingConfig = defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: CountConfig}).config;
        assert.ok(CountingConfig);
        assert.deepStrictEqual(CountingConfig.assert({port: 8080, count: "3"}), {port: 8080, count: 3});
        assert.throws(() => CountingConfig.assert({port: 8080}));
        assert.throws(() => CountingConfig.assert({count: "3"}));
        const StrictConfig = defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: schema({"+": "reject", "count": "number"})}).config;
        assert.ok(StrictConfig);
        assert.deepStrictEqual(StrictConfig.assert({port: 8080, host: "127.0.0.1", count: 3}), {port: 8080, host: "127.0.0.1", count: 3});
        assert.throws(() => StrictConfig.assert({port: 8080, count: 3, other: ""}));
    });

    it("serves handlers' getConfig the configuration from the last reload without listening again", async (t) => {
        // eslint-disable-next-line new-cap -- Fastify's public API
        const server = Fastify();
        t.after(() => server.close());
        const listen = t.mock.method(server, "listen", (_options: FastifyListenOptions) => Promise.resolve(listen_address));
        const config_routes = defineFastifyRoutes({
            uses: [],
            routes: [{method: "GET", path: "/config", handle: (context: CountContext) => context.getConfig()}],
        });
        const gateway = defineFastifyGateway({id: "web", server, uses: [], config: CountConfig, mounts: [count_routes, config_routes]});
        assert.ok(gateway.start && gateway.onConfigReload && gateway.config);
        const GatewayConfig = gateway.config;

        await gateway.start(lifecycleContext(recordingContext(GatewayConfig.assert({port: 1, count: "3"})).context));
        assert.deepStrictEqual((await server.inject({method: "GET", url: "/count"})).json(), {count: 3});
        assert.deepStrictEqual((await server.inject({method: "GET", url: "/config"})).json(), {port: 1, count: 3});

        await gateway.onConfigReload(lifecycleContext(recordingContext(GatewayConfig.assert({port: 2, host: "::1", count: "4"})).context));
        assert.deepStrictEqual((await server.inject({method: "GET", url: "/count"})).json(), {count: 4});
        assert.deepStrictEqual(listen.mock.calls.map((call) => call.arguments[0]), [{port: 1}]);
    });

    it("type-checks that the gateway's `config` covers the configuration each mount and route reads", () => {
        // @ts-expect-error -- the gateway declares no `config`
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], mounts: [count_routes]});
        const OtherConfig = schema({other: "string"});
        // @ts-expect-error -- the gateway's `config` has no `count`
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: OtherConfig, mounts: [count_routes]});
        const BothConfig = OtherConfig.and(CountConfig);
        const both_routes = defineFastifyRoutes({
            uses: [],
            routes: [defineFastifyRoute({method: "GET", path: "/both", handle: (context: GatewayHandlerContext<readonly [], typeof BothConfig.infer>) => context.getConfig()})],
        });
        // @ts-expect-error -- the gateway's `config` has no `other`
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: CountConfig, mounts: [both_routes]});
        // @ts-expect-error -- the gateway's `config` has no `other`, which its own route reads
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: CountConfig, routes: both_routes.routes});
        // @ts-expect-error -- the gateway declares no `config`, which its own route reads
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], routes: count_routes.routes});
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: BothConfig, mounts: [count_routes, both_routes], routes: count_routes.routes});
        const mixed_routes = defineFastifyRoutes({uses: [], routes: [...count_routes.routes, ...both_routes.routes]});
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: BothConfig, mounts: [mixed_routes]});
        // @ts-expect-error -- the gateway's `config` has no `other`, which one of the group's routes reads
        defineFastifyGateway({id: "web", server: fakeServer().server, uses: [], config: CountConfig, mounts: [mixed_routes]});
        defineFastifyRoutes({
            uses: [],
            routes: [{
                method: "GET",
                path: "/",
                // @ts-expect-error -- an unannotated handler reads no particular configuration
                handle: (context) => context.getConfig().count,
            }],
        });
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
        defineFastifyGateway({
            id: "web",
            server: fakeServer().server,
            uses: [CounterCalls],
            mounts: [defineFastifyRoutes({uses: [GreeterCalls], routes: []})],
            routes: [{
                method: "GET",
                path: "/",
                handle: ({call}) =>
                    // @ts-expect-error -- GreeterCalls is in a mount's `uses`, not the gateway's
                    call(GreeterCalls.calls.greet, {name: "a"}),
            }],
        });
    });
});

/** Returns a ready server with `mount` applied, closed after the test. Unless `default_errors` is set, `errors` records thrown errors. */
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

describe("mountFastifyRoutes", () => {
    let checked_count = 0;
    const echo_routes = defineFastifyRoutes({
        uses: [],
        routes: [
            defineFastifyRoute({
                method: "POST",
                path: "/checked/:id",
                params: schema({id: "string.numeric.parse"}),
                body: schema({name: "string"}),
                querystring: schema({n: "string.numeric.parse"}),
                handle: () => {
                    checked_count++;
                    return {};
                },
            }),
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
            ...(["GET", "POST", "DELETE"] as const).flatMap((method) => [
                {method, path: "/go", handle({redirect}: GatewayHandlerContext) { redirect("/page"); }},
                {method, path: "/temporary", handle({redirect}: GatewayHandlerContext) { redirect("/page", false); }},
                {method, path: "/moved", handle({redirect}: GatewayHandlerContext) { redirect("/page", true); }},
                {method, path: "/found", handle({redirect}: GatewayHandlerContext) { redirect("/page", 302); }},
            ]),
            {
                method: "GET",
                path: "/options",
                preHandler: async (_request, reply) => { reply.header("x-pre-handler", "ran"); },
                schema: {response: {200: {type: "object", properties: {kept: {type: "string"}}}}},
                handle: () => ({kept: "yes", dropped: "no"}),
            },
        ],
    });

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

    it("infers the handler's request parts from the route's schemas", () => {
        defineFastifyRoute({
            method: "POST",
            path: "/:id",
            params: schema({id: "string.numeric.parse"}),
            body: schema({name: "string"}),
            handle: ({params, body, querystring}) => {
                const id: number = params.id;
                const name: string = body.name;
                const no_querystring: null = querystring;
                // @ts-expect-error -- the body schema has no `other`
                return [id, name, no_querystring, body.other];
            },
        });
    });

    it("throws a 400 RouteValidationError naming the part that failed its schema, before the handler runs", async (t) => {
        const {server, errors} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const cases: readonly (readonly [InjectOptions, string])[] = [
            [{method: "POST", url: "/checked/x?n=1", payload: {name: "a"}}, "params"],
            [{method: "POST", url: "/checked/7?n=1", payload: {name: 1}}, "body"],
            [{method: "POST", url: "/checked/7?n=1"}, "body"],
            [{method: "POST", url: "/checked/7?n=x", payload: {name: "a"}}, "querystring"],
            [{method: "POST", url: "/checked/7", payload: {name: "a"}}, "querystring"],
        ];
        checked_count = 0;
        for(const [request, part] of cases) {
            const label = `${String(request.url)} ${JSON.stringify(request.payload)}`;
            const error_count = errors.length;
            const response = await server.inject(request);
            assert.strictEqual(response.statusCode, 400, label);
            assert.strictEqual(errors.length, error_count + 1, label);
            const error = errors.at(-1);
            assert.ok(error instanceof RouteValidationError, label);
            assert.strictEqual(error.statusCode, 400, label);
            assert.strictEqual(error.validationContext, part, label);
            assert.ok(error.cause instanceof TraversalError, label);
        }
        assert.strictEqual(checked_count, 0);
        assert.strictEqual((await server.inject({method: "POST", url: "/checked/7?n=1", payload: {name: "a"}})).statusCode, 200);
        assert.strictEqual(checked_count, 1);
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

    it("answers a thrown NotFoundError with Fastify's default 404 body without a custom error handler", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, defineFastifyRoutes({
            uses: [],
            routes: [{method: "GET", path: "/missing", handle() { throw new NotFoundError(); }}],
        })), true);
        const response = await server.inject({method: "GET", url: "/missing"});
        assert.strictEqual(response.statusCode, 404);
        assert.strictEqual(response.json<{error: unknown}>().error, "Not Found");
    });

    it("forwards other RouteOptions to Fastify", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const response = await server.inject({method: "GET", url: "/options"});
        assert.strictEqual(response.headers["x-pre-handler"], "ran");
        assert.deepStrictEqual(response.json(), {kept: "yes"});
    });

    it("hands the handler the raw Fastify request and reply", async (t) => {
        const hooked: unknown[] = [];
        const handled: unknown[] = [];
        const {server} = await serve(t, (s) => {
            s.addHook("preHandler", async (request, reply) => { hooked.push(request, reply); });
            mountFastifyRoutes(s, defineFastifyRoutes({
                uses: [],
                routes: [{method: "GET", path: "/objects", handle: ({request, reply}) => {
                    handled.push(request, reply);
                    return {};
                }}],
            }));
        });
        assert.strictEqual((await server.inject({method: "GET", url: "/objects"})).statusCode, 200);
        assert.strictEqual(handled.length, 2);
        assert.strictEqual(handled[0], hooked[0]);
        assert.strictEqual(handled[1], hooked[1]);
    });

    it("sends html() content as HTML_MEDIA_TYPE", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const page = await server.inject({method: "GET", url: "/page"});
        assert.strictEqual(page.headers["content-type"], HTML_MEDIA_TYPE);
        assert.strictEqual(page.body, "<p>hi</p>");
    });

    it("sends sendHtml() content as HTML_MEDIA_TYPE and returns the reply", async (t) => {
        const returned: boolean[] = [];
        const {server} = await serve(t, (s) => s.get("/", async (_request, reply) => {
            returned.push(sendHtml(reply, "<b>hi</b>") === reply);
            return reply;
        }));
        const sent = await server.inject({method: "GET", url: "/"});
        assert.strictEqual(sent.statusCode, 200);
        assert.strictEqual(sent.headers["content-type"], HTML_MEDIA_TYPE);
        assert.strictEqual(sent.body, "<b>hi</b>");
        assert.deepStrictEqual(returned, [true]);
    });

    it("sends redirect()'s status by method and permanence, or the explicit status", async (t) => {
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, echo_routes));
        const cases = [
            ["GET", "/go", 307], ["HEAD", "/go", 307], ["POST", "/go", 303], ["DELETE", "/go", 303],
            ["GET", "/temporary", 307], ["HEAD", "/temporary", 307], ["POST", "/temporary", 303], ["DELETE", "/temporary", 303],
            ["GET", "/moved", 308], ["HEAD", "/moved", 308], ["POST", "/moved", 308], ["DELETE", "/moved", 308],
            ["GET", "/found", 302], ["POST", "/found", 302], ["DELETE", "/found", 302],
        ] as const;
        for(const [method, url, status] of cases) {
            const response = await server.inject({method, url});
            assert.strictEqual(response.statusCode, status, `${method} ${url}`);
            assert.strictEqual(response.headers.location, "/page", `${method} ${url}`);
        }
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

    it("serves handlers' getConfig through the `getConfig` option, and throws UnboundConfigError without one", async (t) => {
        const CountConfig = schema({count: "number"});
        type CountContext = GatewayHandlerContext<readonly [], typeof CountConfig.infer>;
        const reading = defineFastifyRoutes({
            uses: [],
            routes: [{method: "GET", path: "/count", handle: (context: CountContext) => context.getConfig()}],
        });
        const served = await serve(t, (s) => mountFastifyRoutes(s, reading, {getConfig: () => CountConfig.assert({count: 3})}));
        assert.deepStrictEqual((await served.server.inject({method: "GET", url: "/count"})).json(), {count: 3});

        const unserved = await serve(t, (s) => mountFastifyRoutes(s, reading));
        assert.strictEqual((await unserved.server.inject({method: "GET", url: "/count"})).statusCode, 500);
        assert.ok(unserved.errors[0] instanceof UnboundConfigError);

        const calling = defineFastifyRoutes({
            uses: [CounterCalls],
            routes: [{method: "GET", path: "/config", handle: (context) => context.getConfig()}],
        });
        const call_only = await serve(t, (s) => mountFastifyRoutes(s, calling, {call: () => Promise.resolve({count: 3})}));
        assert.strictEqual((await call_only.server.inject({method: "GET", url: "/config"})).statusCode, 500);
        assert.ok(call_only.errors[0] instanceof UnboundConfigError);
    });
});

describe("createExposeCallsFactory", () => {
    const ProbeCalls = defineComponentCalls("probe", {
        take: {input: schema("null").or({n: "number"}), output: schema("unknown")},
        at: {input: schema({when: "string.date.parse"}), output: schema({year: "number"})},
    });
    const callPath = ({component_id, name}: CallEndpointReference) => `/api/v1/${component_id}/${name}`;
    const silent_log: Logger = {debug() {}, info() {}, warn() {}, error() {}};

    const post = (server: FastifyInstance, url: string, payload: string) =>
        server.inject({method: "POST", url, payload, headers: {"content-type": "application/json"}});

    it("serves each call as a POST at its call path and passes the raw body, including null, to `call`", async (t) => {
        const {exposeCalls} = createExposeCallsFactory({callPath, base: "/api"});
        const calls: RecordedCall[] = [];
        const {server} = await serve(t, (s) => mountFastifyRoutes(s, exposeCalls(ProbeCalls), {call: (reference, input: unknown) => {
            calls.push([reference, input]);
            return Promise.resolve({received: input});
        }}));
        const response = await post(server, "/api/v1/probe/take", "null");
        assert.strictEqual(response.statusCode, 200);
        assert.deepStrictEqual(response.json(), {output: {received: null}} satisfies OutputBody);
        const dated = await post(server, "/api/v1/probe/at", JSON.stringify({when: "2026-02-03", extra: [1]}));
        assert.strictEqual(dated.statusCode, 200);
        assert.deepStrictEqual(dated.json(), {output: {received: {when: "2026-02-03", extra: [1]}}} satisfies OutputBody);
        assert.deepStrictEqual(calls, [[ProbeCalls.calls.take, null], [ProbeCalls.calls.at, {when: "2026-02-03", extra: [1]}]]);
    });

    it("round-trips calls and ErrorBody messages with a client of the same callPath", async (t) => {
        const ShopCalls = defineComponentCalls("shop", {
            name: {input: schema({}), output: schema("string")},
            buy: {input: schema({n: "number"}), output: schema({n: "number"})},
        });
        const {exposeCalls} = createExposeCallsFactory({callPath, base: "/api"});
        // eslint-disable-next-line new-cap -- Fastify's public API
        const server = Fastify();
        t.after(() => server.close());
        server.setErrorHandler((error: {statusCode?: number}, _request, reply) => {
            const message = error instanceof RouteValidationError ? `Rejected ${error.validationContext}.` : "Failed.";
            reply.status(error.statusCode ?? 500).send({error: message} satisfies ErrorBody);
        });
        mountFastifyRoutes(server, exposeCalls(ShopCalls), {call: (reference) => {
            if(reference === ShopCalls.calls.name) return Promise.resolve("shop");
            return Promise.reject(new CallInputError("shop", "buy", new Error("bad")));
        }});
        await server.ready();
        t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
            const response = await server.inject({method: "POST", url, headers: Object.fromEntries(new Headers(init.headers)), payload: String(init.body)});
            return new Response(response.body, {status: response.statusCode, headers: {"content-type": String(response.headers["content-type"])}});
        });

        const shop = createComponentClientFactory({callPath})<typeof ShopCalls>(ShopCalls.id);
        assert.strictEqual(await shop("name")(), "shop");
        await assert.rejects(shop("buy")({n: 1}), (err: unknown) => {
            assert.ok(err instanceof CallFailedError);
            assert.strictEqual(err.status, 400);
            assert.strictEqual(err.server_message, "Rejected body.");
            return true;
        });
    });

    it("validates a type-changing input only once, and rejects an invalid body with RouteValidationError", async (t) => {
        const component = defineComponent({
            calls: ProbeCalls,
            uses: [],
            handlers: {take: (_context, input) => input, at: (_context, {when}) => ({year: when.getUTCFullYear()})},
        });
        const app = createApplication({components: [component], logger: () => silent_log});
        await app.start();
        t.after(() => app.stop());
        const {exposeCalls} = createExposeCallsFactory({callPath, base: "/api"});
        const {server, errors} = await serve(t, (s) => mountFastifyRoutes(s, exposeCalls(ProbeCalls), {call: app.call}));

        const valid = await post(server, "/api/v1/probe/at", JSON.stringify({when: "2026-02-03"}));
        assert.strictEqual(valid.statusCode, 200);
        assert.deepStrictEqual(valid.json(), {output: {year: 2026}} satisfies OutputBody);

        const invalid = await post(server, "/api/v1/probe/at", JSON.stringify({when: "not a date"}));
        assert.strictEqual(invalid.statusCode, 400);
        const [error] = errors;
        assert.ok(error instanceof RouteValidationError);
        assert.strictEqual(error.validationContext, "body");
        assert.ok(error.cause instanceof TraversalError);
    });

    it("propagates every failure other than the call's own input failure unchanged", async (t) => {
        const {exposeCalls} = createExposeCallsFactory({callPath, base: "/api"});
        const failures = [
            ["nested call input", new CallInputError("other", "take", new Error("bad")), 500],
            ["sibling call input", new CallInputError("probe", "other", new Error("bad")), 500],
            ["plain error", new Error("boom"), 500],
            ["error with a status", Object.assign(new Error("conflict"), {statusCode: 409}), 409],
        ] as const;
        for(const [label, failure, status] of failures) {
            const {server, errors} = await serve(t, (s) => mountFastifyRoutes(s, exposeCalls(ProbeCalls), {call: (): Promise<never> => Promise.reject(failure)}));
            assert.strictEqual((await post(server, "/api/v1/probe/take", "null")).statusCode, status, label);
            assert.strictEqual(errors[0], failure, label);
        }
    });

    it("throws InvalidCallEndpointError for a call name that is not ASCII letters, digits, `_`, and `-`", () => {
        const {exposeCalls} = createExposeCallsFactory({callPath, base: "/api"});
        for(const name of [":id", "*", "a/b", "a?b", "a#b", "a%2F", "..", "a.b", "a b", "", "é", "ａ", "a\u0000", "a\n"]) {
            const calls = defineComponentCalls("probe", {[name]: {input: schema("null"), output: schema("null")}});
            assert.throws(() => exposeCalls(calls), (err: unknown) => err instanceof InvalidCallEndpointError && err.component_id === "probe" && err.call_name === name, JSON.stringify(name));
        }
        for(const name of ["getInfo", "get_info", "get-info", "v2"]) {
            const calls = defineComponentCalls("probe", {[name]: {input: schema("null"), output: schema("null")}});
            assert.doesNotThrow(() => exposeCalls(calls), name);
        }
    });

    it("throws InvalidCallEndpointError for a call path not under `base`", () => {
        for(const path of ["/api", "/api-v1/probe/take", "/other/probe/take", "api/probe/take"]) {
            const {exposeCalls} = createExposeCallsFactory({callPath: () => path, base: "/api"});
            assert.throws(() => exposeCalls(ProbeCalls), InvalidCallEndpointError, path);
        }
    });

    it("throws InvalidCallEndpointError for a call with a local input or output", () => {
        const {exposeCalls} = createExposeCallsFactory({callPath, base: "/api"});
        const declarations = {
            input: {input: defineLocalInput<() => void>(), output: schema("null")},
            output: {input: schema("null"), output: defineLocalOutput<() => void>()},
        };
        for(const [name, declaration] of Object.entries(declarations)) {
            const calls = defineComponentCalls("probe", {take: declaration});
            assert.throws(() => exposeCalls(calls), (err: unknown) => err instanceof InvalidCallEndpointError && err.component_id === "probe" && err.call_name === "take", name);
        }
    });

    it("answers a GET of `base` or any path under it with NotFoundError, leaving exposed calls served", async (t) => {
        const {exposeCalls, not_found_routes} = createExposeCallsFactory({callPath, base: "/api"});
        const {server, errors} = await serve(t, (s) => {
            mountFastifyRoutes(s, exposeCalls(ProbeCalls), {call: () => Promise.resolve(null)});
            mountFastifyRoutes(s, not_found_routes);
        });
        for(const url of ["/api", "/api/", "/api/v1/probe/take", "/api/a/b/c"]) {
            errors.length = 0;
            assert.strictEqual((await server.inject({method: "GET", url})).statusCode, 404, url);
            assert.ok(errors[0] instanceof NotFoundError, url);
        }
        for(const url of ["/apix", "/ap"]) {
            errors.length = 0;
            assert.strictEqual((await server.inject({method: "GET", url})).statusCode, 404, url);
            assert.deepStrictEqual(errors, [], url);
        }
        assert.strictEqual((await post(server, "/api/v1/probe/take", "null")).statusCode, 200);
    });

    it("gives every exposed and not-found route the `config` option", async (t) => {
        const {exposeCalls, not_found_routes} = createExposeCallsFactory({callPath, base: "/api", config: {tag: "calls"}});
        const seen: unknown[] = [];
        const {server} = await serve(t, (s) => {
            s.addHook("onRequest", async (request) => {
                const {config} = request.routeOptions;
                seen.push("tag" in config ? config.tag : null);
            });
            mountFastifyRoutes(s, exposeCalls(ProbeCalls), {call: () => Promise.resolve(null)});
            mountFastifyRoutes(s, not_found_routes);
        });
        await post(server, "/api/v1/probe/take", "null");
        await server.inject({method: "GET", url: "/api"});
        await server.inject({method: "GET", url: "/api/x"});
        assert.deepStrictEqual(seen, ["calls", "calls", "calls"]);
    });
});
