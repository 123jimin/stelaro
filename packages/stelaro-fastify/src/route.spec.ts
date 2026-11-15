import {deepEqual, equal, ok} from "node:assert/strict";
import {test} from "node:test";

import type {AnyComponentCalls, ComponentCallFn} from "@jiminp/stelaro";
import {defineComponentCalls} from "@jiminp/stelaro";
import {assertEqualType} from "@jiminp/tooltool";
import {TraversalError, type} from "arktype";
import type {FastifyReply, FastifyRequest} from "fastify";
import fastify from "fastify";

import type {GatewayHandlerContext} from "./index.ts";
import {
    defineFastifyRoute, defineFastifyRoutes, HTML_MEDIA_TYPE, mountFastifyRoutes, NotFoundError, RouteValidationError, UnboundCallError,
    UnboundConfigError,
} from "./index.ts";

const threads = defineComponentCalls("threads", {
    get: {input: type({thread_id: "string"}), output: type({title: "string"})},
});
const users = defineComponentCalls("users", {
    get: {input: type("string"), output: type({name: "string"})},
});

test("route schemas validate request parts and leave undeclared parts null", async () => {
    const seen: unknown[] = [];
    const route = defineFastifyRoute({
        method: "POST",
        path: "/threads/:thread_id",
        params: type({thread_id: "string.numeric.parse"}),
        querystring: type({"sort?": "'asc' | 'desc'"}),
        handle(context) {
            assertEqualType<typeof context.params, {thread_id: number}>();
            assertEqualType<typeof context.querystring, {sort?: "asc" | "desc"}>();
            assertEqualType<typeof context.body, null>();
            assertEqualType<typeof context.request, FastifyRequest>();
            assertEqualType<typeof context.reply, FastifyReply>();
            seen.push({...context.params}, context.body, {...context.querystring});
            return {ok: true};
        },
    });
    const server = fastify();
    mountFastifyRoutes(server, defineFastifyRoutes({
        uses: [],
        routes: [route, {
            method: "GET",
            path: "/plain",
            handle(context) {
                assertEqualType<[typeof context.params, typeof context.body, typeof context.querystring], [null, null, null]>();
                return [context.params, context.body, context.querystring];
            },
        }],
    }));

    const accepted = await server.inject({method: "POST", url: "/threads/12?sort=asc", payload: {ignored: true}});
    deepEqual(accepted.json(), {ok: true});
    deepEqual(seen, [{thread_id: 12}, null, {sort: "asc"}]);
    deepEqual((await server.inject("/plain")).json(), [null, null, null]);
});

test("validation failures carry the failing part and schema error to Fastify's error handling", async () => {
    const route = defineFastifyRoute({
        method: "POST",
        path: "/threads/:thread_id",
        params: type({thread_id: "string.numeric"}),
        body: type({title: "string"}),
        querystring: type({"page?": "string.numeric"}),
        handle: () => "unreachable",
    });
    const server = fastify();
    mountFastifyRoutes(server, {uses: [], routes: [route]});
    const default_reply = await server.inject({method: "POST", url: "/threads/abc", payload: {title: 3}});
    equal(default_reply.statusCode, 400);
    deepEqual(Object.keys(default_reply.json()).sort(), ["error", "message", "statusCode"]);

    const errors: unknown[] = [];
    const handled = fastify();
    handled.setErrorHandler((error, _request, reply) => {
        errors.push(error);
        return reply.code(422).send({part: (error as RouteValidationError).validationContext});
    });
    mountFastifyRoutes(handled, {uses: [], routes: [route]});
    const cases = [
        {url: "/threads/abc", payload: {title: "Hi"}, part: "params"},
        {url: "/threads/1", payload: {title: 3}, part: "body"},
        {url: "/threads/1?page=x", payload: {title: "Hi"}, part: "querystring"},
    ];
    for(const {url, payload, part} of cases) {
        const reply = await handled.inject({method: "POST", url, payload});
        equal(reply.statusCode, 422);
        deepEqual(reply.json(), {part});
    }
    for(const error of errors) {
        ok(error instanceof RouteValidationError);
        equal(error.statusCode, 400);
        ok(error.cause instanceof TraversalError);
    }
    equal(errors.length, 3);
});

test("route options pass through to Fastify and responses use the handler result", async () => {
    const order: string[] = [];
    const server = fastify();
    server.addHook("onRoute", (options) => {
        if(options.url === "/options" && options.method === "GET") {
            order.push(`${JSON.stringify(options.config)}:${options.bodyLimit}`);
        }
    });
    mountFastifyRoutes(server, {uses: [], routes: [{
        method: "GET",
        path: "/options",
        config: {label: "custom"},
        bodyLimit: 128,
        schema: {querystring: {type: "object", properties: {n: {type: "integer"}}, required: ["n"]}},
        preHandler(request, _reply, done) {
            order.push(`pre:${request.routeOptions.config.url}`);
            done();
        },
        handle: ({request}) => ({config: request.routeOptions.config, query: request.query}),
    }]});
    deepEqual((await server.inject("/options?n=3")).json(), {config: {label: "custom", url: "/options", method: "GET"}, query: {n: 3}});
    // Fastify's own schema validation stays in effect.
    equal((await server.inject("/options")).statusCode, 400);
    deepEqual(order, [`{"label":"custom"}:128`, "pre:/options"]);
});

test("redirects choose status from permanence and method, and html sends the HTML media type", async () => {
    const server = fastify();
    mountFastifyRoutes(server, {uses: [], routes: [
        {method: "GET", path: "/temporary", handle: ({redirect}) => redirect("/a")},
        {method: "POST", path: "/temporary", handle: ({redirect}) => redirect("/b", false)},
        {method: "HEAD", path: "/head", handle: ({redirect}) => redirect("/c")},
        {method: "POST", path: "/permanent", handle: ({redirect}) => redirect("/d", true)},
        {method: "GET", path: "/explicit", handle: ({redirect}) => redirect("/e", 301)},
        {method: "GET", path: "/html", handle: ({html}) => html("<p>Hi</p>")},
        {method: "GET", path: "/missing", handle() { throw new NotFoundError(); }},
    ]});
    const cases = [
        ["GET", "/temporary", 307, "/a"],
        ["POST", "/temporary", 303, "/b"],
        ["HEAD", "/head", 307, "/c"],
        ["POST", "/permanent", 308, "/d"],
        ["GET", "/explicit", 301, "/e"],
    ] as const;
    for(const [method, url, status, location] of cases) {
        const reply = await server.inject({method, url});
        deepEqual([reply.statusCode, reply.headers.location], [status, location]);
    }
    const html = await server.inject("/html");
    deepEqual([html.headers["content-type"], html.body], [HTML_MEDIA_TYPE, "<p>Hi</p>"]);
    const missing = await server.inject("/missing");
    deepEqual([missing.statusCode, missing.json().message], [404, "Not Found"]);
});

test("mounted handlers use the supplied call and configuration getter", async () => {
    const calls: unknown[] = [];
    let site_name = "first";
    const call: ComponentCallFn<readonly AnyComponentCalls[]> = async (reference, input) => {
        calls.push([reference, input]);
        return {title: "Thread"};
    };
    const group = defineFastifyRoutes({
        uses: [threads],
        routes: [{
            method: "GET",
            path: "/",
            async handle(context: GatewayHandlerContext<readonly [typeof threads], {site_name: string}>) {
                const thread = await context.call(threads.calls.get, {thread_id: "1"});
                assertEqualType<typeof thread, {title: string}>();
                return `${context.getConfig().site_name}: ${thread.title}`;
            },
        }],
    });
    assertEqualType<typeof group.uses, readonly [typeof threads]>();
    const server = fastify();
    mountFastifyRoutes(server, group, {call, getConfig: () => ({site_name})});
    equal((await server.inject("/")).body, "first: Thread");
    site_name = "second";
    equal((await server.inject("/")).body, "second: Thread");
    deepEqual(calls, [[threads.calls.get, {thread_id: "1"}], [threads.calls.get, {thread_id: "1"}]]);
});

test("unbound calls reject and unbound configuration throws", async () => {
    const errors: unknown[] = [];
    const server = fastify();
    server.setErrorHandler((error, _request, reply) => {
        errors.push(error);
        return reply.code(500).send();
    });
    const handlers = [
        // Mount without options to exercise the unbound fallback.
        ({call}: GatewayHandlerContext) => call(threads.calls.get, {thread_id: "1"}),
        ({getConfig}: GatewayHandlerContext) => getConfig(),
    ];
    mountFastifyRoutes(server, {uses: [], routes: handlers.map((handle, index) => ({method: "GET", path: `/${index}`, handle}))});
    await server.inject("/0");
    await server.inject("/1");
    const [call_error, config_error] = errors;
    ok(call_error instanceof UnboundCallError);
    deepEqual([call_error.component_id, call_error.call_name], ["threads", "get"]);
    ok(config_error instanceof UnboundConfigError);
});

test("defined routes keep their schema types inside route groups", () => {
    const params = type({thread_id: "string"});
    const route = defineFastifyRoute({method: "GET", path: "/:thread_id", params, handle: (context) => context.params.thread_id});
    assertEqualType<typeof route.params, typeof params>();
    assertEqualType<typeof route.body, undefined>();
    const group = defineFastifyRoutes({
        uses: [threads],
        routes: [route, defineFastifyRoute({
            method: "POST",
            path: "/threads",
            body: type({thread_id: "string"}),
            async handle({call, body}) {
                assertEqualType<typeof body, {thread_id: string}>();
                return call(threads.calls.get, body);
            },
        })],
    });
    equal(group.routes[0], route);
});

test("route and group types reject undeclared calls and incompatible options", () => {
    defineFastifyRoutes({
        uses: [threads],
        routes: [{
            method: "GET",
            path: "/",
            async handle({call}) {
                await call(threads.calls.get, {thread_id: "1"});
                // @ts-expect-error The group does not use `users`.
                await call(users.calls.get, "1");
                // @ts-expect-error The input must match the call's schema.
                await call(threads.calls.get, {thread_id: 1});
            },
        }],
    });
    defineFastifyRoutes({
        uses: [],
        routes: [{
            method: "GET",
            path: "/",
            // @ts-expect-error Fastify's `bodyLimit` is a number.
            bodyLimit: "large",
            handle: () => null,
        }],
    });
    defineFastifyRoute({
        // @ts-expect-error Routes take one method.
        method: ["GET", "POST"],
        path: "/",
        handle: () => null,
    });
    // @ts-expect-error A group that uses components requires `call`.
    mountFastifyRoutes(fastify(), defineFastifyRoutes({uses: [threads], routes: []}));
    const configured = defineFastifyRoutes({
        uses: [],
        routes: [{method: "GET", path: "/", handle: (context: GatewayHandlerContext<readonly [], {site_name: string}>) => context.getConfig()}],
    });
    // @ts-expect-error A group that reads configuration needs `getConfig`.
    mountFastifyRoutes(fastify(), configured);
    // @ts-expect-error getConfig must return site_name.
    mountFastifyRoutes(fastify(), configured, {call: async () => { throw new Error(); }, getConfig: () => ({})});
});
