import {deepEqual, equal, ok, rejects, throws} from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {execPath} from "node:process";
import {test} from "node:test";

import {CallInputError, createApplication, defineComponent, defineComponentCalls, defineLocalInput, defineLocalOutput, EmptyInput} from "@jiminp/stelaro";
import {assertEqualType} from "@jiminp/tooltool";
import {TraversalError, type} from "arktype";
import type {FastifyError} from "fastify";
import fastify from "fastify";

import type {CallEndpointReference} from "./client.ts";
import {CallFailedError, createComponentClientFactory, getCallPath, isErrorBody} from "./client.ts";
import type {FastifyRouteGroup} from "./index.ts";
import {
    createExposeCallsFactory, defineFastifyGateway, InvalidCallEndpointError, JSON_MEDIA_TYPE, mountFastifyRoutes, NotFoundError, RouteValidationError,
} from "./index.ts";
import {createBaseDirectory, writeConfig} from "./test-util.ts";

const base = "/calls";
const callPath = (reference: CallEndpointReference) => getCallPath(base, reference);

test("exposure rejects invalid names, paths outside the base, and local schemas", () => {
    const {exposeCalls} = createExposeCallsFactory({base, callPath});
    const declaration = {input: EmptyInput, output: type("boolean")};
    for(const name of ["", "get/value", "get.value", "get?", "읽기", "get\n"]) {
        throws(() => exposeCalls(defineComponentCalls("example", {[name]: declaration})), {
            name: "InvalidCallEndpointError", component_id: "example", call_name: name,
        });
    }
    const calls = defineComponentCalls("example", {"get-Value_1": declaration});
    equal(exposeCalls(calls).routes[0]?.path, "/calls/example/get-Value_1");
    for(const path of [base, "/calls-extra/example/read", "/other/example/read"]) {
        const invalid = createExposeCallsFactory({base, callPath: () => path});
        throws(() => invalid.exposeCalls(calls), InvalidCallEndpointError);
    }
    for(const local of [
        {input: defineLocalInput<() => void>(), output: declaration.output},
        {input: declaration.input, output: defineLocalOutput<() => void>()},
    ]) {
        throws(() => exposeCalls(defineComponentCalls("example", {read: local})), InvalidCallEndpointError);
    }
});

test("typed clients round-trip JSON inputs and outputs through component dispatch", async (t) => {
    let validations = 0;
    const calls = defineComponentCalls("example", {
        read: {
            input: type("string.numeric").pipe((value) => {
                validations++;
                return Number(value);
            }),
            output: type({value: "number"}),
        },
        check: {input: EmptyInput, output: type("boolean")},
        nullable: {input: type("null"), output: type("null")},
    });
    const component = defineComponent({
        calls,
        uses: [],
        handlers: {read: (_context, value) => ({value}), check: () => true, nullable: (_context, input) => input},
    });
    const base_dir = await createBaseDirectory(t);
    await writeConfig(base_dir, "web", 'port = 0\nhost = "127.0.0.1"\n');
    const server = fastify();
    const seen_configs: unknown[] = [];
    const seen_errors: unknown[] = [];
    const config = {label: "component calls"};
    const {exposeCalls, not_found_routes} = createExposeCallsFactory({base, callPath, config});
    const group = exposeCalls(calls);
    assertEqualType<typeof group, FastifyRouteGroup<readonly [typeof calls]>>();
    assertEqualType<typeof not_found_routes, FastifyRouteGroup<readonly []>>();
    equal(group.uses[0], calls);
    const gateway = defineFastifyGateway({id: "web", server, uses: [], mounts: [group, not_found_routes]});
    assertEqualType<typeof gateway.uses, readonly (typeof calls)[]>();
    server.addHook("onRoute", (route) => { seen_configs.push(route.config); });
    server.setErrorHandler<FastifyError>((error, _request, reply) => {
        seen_errors.push(error);
        return reply.code(error.statusCode ?? 500).send({error: error.message});
    });
    const app = createApplication({components: [component, gateway]}, {base_dir});
    await app.start();
    t.after(() => app.stop());
    ok(seen_configs.length >= 5);
    deepEqual(seen_configs, seen_configs.map(() => config));
    const address = server.addresses()[0];
    ok(address != null && typeof address !== "string");
    const origin = `http://${address.address}:${address.port}`;

    const createClient = createComponentClientFactory({callPath: (reference) => `${origin}${callPath(reference)}`});
    const client = createClient<typeof calls>("example");
    const read = client("read");
    const nullable = client("nullable");
    assertEqualType<Parameters<typeof client>, [name: "read" | "check" | "nullable"]>();
    assertEqualType<Parameters<typeof read>, [input: string]>();
    assertEqualType<ReturnType<typeof read>, Promise<{value: number}>>();
    assertEqualType<Parameters<typeof nullable>, [input: null]>();
    assertEqualType<ReturnType<typeof nullable>, Promise<null>>();
    // @ts-expect-error The surface declares no call with this name.
    client("missing");
    // @ts-expect-error The component ID must match the surface.
    createClient<typeof calls>("other");
    // @ts-expect-error The caller must supply the component call surface type.
    createClient("example");

    deepEqual(await read("42"), {value: 42});
    equal(validations, 1);
    equal(await client("check")(), true);
    equal(await nullable(null), null);
    const response = await server.inject({method: "POST", url: callPath(calls.calls.nullable), headers: {"content-type": JSON_MEDIA_TYPE}, payload: "null"});
    equal(response.headers["content-type"], JSON_MEDIA_TYPE);
    deepEqual(response.json(), {output: null});

    await rejects(read("not numeric"), {
        name: "CallFailedError",
        message: 'Call "example.read" failed (HTTP 400). Invalid request body.',
        status: 400,
        server_message: "Invalid request body.",
    });
    const [error] = seen_errors;
    ok(error instanceof RouteValidationError);
    equal(error.validationContext, "body");
    ok(error.cause instanceof TraversalError);
    equal(validations, 1);

    for(const url of [base, `${base}/`, callPath(calls.calls.read), `${base}/other/deep/path`]) {
        equal((await server.inject(url)).statusCode, 404);
        ok(seen_errors.at(-1) instanceof NotFoundError);
    }
});

test("nested call input and other failures reach Fastify unchanged", async (t) => {
    const nested_calls = defineComponentCalls("nested", {read: {input: type("string.numeric"), output: type("string")}});
    const nested = defineComponent({calls: nested_calls, uses: [], handlers: {read: (_context, input) => input}});
    const calls = defineComponentCalls("outer", {
        read: {input: EmptyInput, output: type("string")},
        fail: {input: EmptyInput, output: type("string")},
        invalidOutput: {input: EmptyInput, output: type("string > 0")},
    });
    const handler_error = new Error("handler failed");
    let nested_error: unknown;
    const outer = defineComponent({
        calls,
        uses: [nested_calls],
        handlers: {
            async read({call}) {
                try {
                    return await call(nested_calls.calls.read, "invalid");
                } catch (error) {
                    nested_error = error;
                    throw error;
                }
            },
            fail() { throw handler_error; },
            invalidOutput: () => "",
        },
    });
    const base_dir = await createBaseDirectory(t);
    const app = createApplication({components: [outer, nested]}, {base_dir});
    const server = fastify();
    t.after(() => server.close());
    const errors: unknown[] = [];
    server.setErrorHandler<FastifyError>((error, _request, reply) => {
        errors.push(error);
        return reply.code(error.statusCode ?? 500).send();
    });
    const {exposeCalls} = createExposeCallsFactory({base, callPath});
    mountFastifyRoutes(server, exposeCalls(calls), {call: app.call});
    await app.start();
    t.after(() => app.stop());
    for(const reference of Object.values(calls.calls)) {
        const reply = await server.inject({method: "POST", url: callPath(reference), payload: {}});
        equal(reply.statusCode, 500);
    }
    ok(nested_error instanceof CallInputError);
    equal(errors[0], nested_error);
    equal(errors[1], handler_error);
    ok(errors[2] instanceof TraversalError);
});

test("the client reads successful output and handles non-OK response bodies", async (t) => {
    const server = fastify();
    t.after(() => server.close());
    server.post("/example/success", () => ({output: 42}));
    server.post("/example/error", (_request, reply) => reply.code(422).send({error: "Rejected"}));
    server.post("/example/emptyError", (_request, reply) => reply.code(409).send({error: ""}));
    server.post("/example/otherShape", (_request, reply) => reply.code(403).send({error: 42}));
    server.post("/example/invalidJson", (_request, reply) => reply.code(502).type(JSON_MEDIA_TYPE).send("{"));
    server.post("/example/emptyBody", (_request, reply) => reply.code(503).send());
    const origin = await server.listen({host: "127.0.0.1", port: 0});
    const createClient = createComponentClientFactory({callPath: (reference) => getCallPath(origin, reference)});
    const declaration = {input: EmptyInput, output: type("string")};
    const calls = defineComponentCalls("example", {
        success: declaration,
        error: declaration,
        emptyError: declaration,
        otherShape: declaration,
        invalidJson: declaration,
        emptyBody: declaration,
    });
    const client = createClient<typeof calls>(calls.id);
    equal(await client("success")(), 42);

    for(const [name, status, message] of [
        ["error", 422, "Rejected"], ["emptyError", 409, ""], ["otherShape", 403, null],
        ["invalidJson", 502, null], ["emptyBody", 503, null],
    ] as const) {
        await rejects(client(name)(), (error) => {
            ok(error instanceof CallFailedError);
            equal(error.status, status);
            equal(error.server_message, message);
            return true;
        });
    }
    equal(getCallPath("/base", {component_id: "组件", name: "a b"}), "/base/组件/a b");
    ok(isErrorBody({error: "Rejected", extra: true}));
    equal(isErrorBody(null), false);
});

test("the client requires an output field in a successful JSON response", async (t) => {
    const calls = defineComponentCalls("example", {read: {input: EmptyInput, output: type("unknown")}});
    const read = createComponentClientFactory({callPath})<typeof calls>(calls.id)("read");
    const fetch = t.mock.method(globalThis, "fetch");
    for(const [body, status] of [
        ["null", 200], ["true", 200], ['"output"', 200], ["[]", 200], ["{}", 200],
        ['{"error":"Missing output"}', 200], ["{", 200], [null, 204],
    ] as const) {
        fetch.mock.mockImplementation(async () => new Response(body, {status}));
        await rejects(read(), (error) => {
            ok(error instanceof CallFailedError);
            equal(error.message, `Call "example.read" failed (HTTP ${status}).`);
            equal(error.status, status);
            equal(error.server_message, null);
            return true;
        });
    }
    for(const output of [null, false, 0, ""]) {
        fetch.mock.mockImplementation(async () => Response.json({output}));
        equal(await read(), output);
    }
});

test("the public client subpath loads without any runtime package dependencies", () => {
    execFileSync(execPath, ["--input-type=module", "--eval", `
        import {registerHooks} from "node:module";

        registerHooks({
            resolve(specifier, context, nextResolve) {
                if (specifier !== "@jiminp/stelaro-fastify/client" && !specifier.startsWith("./")) {
                    throw new Error("Unexpected runtime import " + specifier);
                }
                return nextResolve(specifier, context);
            },
        });

        const {createComponentClientFactory, getCallPath} = await import("@jiminp/stelaro-fastify/client");
        if (typeof createComponentClientFactory !== "function" || typeof getCallPath !== "function") {
            throw new Error("Missing client exports");
        }
    `], {cwd: import.meta.dirname});
});
