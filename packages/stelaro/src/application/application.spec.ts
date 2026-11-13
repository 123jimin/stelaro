import {deepEqual, equal, ok, rejects, throws} from "node:assert/strict";
import {join} from "node:path";
import {test} from "node:test";

import {type} from "arktype";

import type {LoggerFactory} from "../index.ts";
import {
    CallInputError, ConfigValidationError, consoleLoggerFactory, createApplication, defineApplication, defineComponent,
    defineComponentCalls, defineLocalInput, defineLocalOutput, DuplicateComponentIdError, EmptyInput, LifecycleStateError,
    mergeComponentCalls, parseArgs, SecretsValidationError, UndeclaredCallError, UnregisteredCallError,
} from "../index.ts";
import {createTemporaryDirectory} from "../test-util.ts";

const quietLogger: LoggerFactory = () => ({debug() {}, info() {}, warn() {}, error() {}});
const ReadNumber = {input: EmptyInput, output: type("number")};

test("creation validates registration and uses the console logger by default", () => {
    const worker = defineComponent({calls: defineComponentCalls("worker", {}), uses: [], handlers: {}});
    const definition = {components: [worker]};
    equal(defineApplication(definition), definition);
    equal(createApplication(definition).logger, consoleLoggerFactory);
    throws(() => createApplication({components: [worker, worker]}), DuplicateComponentIdError);
});

test("startup loads scoped config and secrets, and state persists within one runtime", async (t) => {
    const root = await createTemporaryDirectory(t);
    await root.join("settings", "worker.toml").write().text('name = "base"');
    await root.join("settings", "worker.test.toml").write().text('name = "overlay"');
    await root.join("credentials", "worker.toml").write().text("token = 1");
    await root.join("credentials", "worker.test.toml").write().text("token = 2");
    const calls = defineComponentCalls("worker", {read: {input: EmptyInput, output: defineLocalOutput<object>()}});
    const peer_calls = defineComponentCalls("peer", {read: {input: EmptyInput, output: defineLocalOutput<object>()}});
    const makeState = () => ({starts: 0});
    const logs: string[] = [];
    const logger: LoggerFactory = (scope) => ({
        ...quietLogger(scope),
        debug: (message) => { logs.push(`${scope}: ${String(message)}`); },
    });
    const worker = defineComponent({
        calls,
        uses: [],
        config: type({name: "string"}),
        secrets: type({token: "number"}),
        state: makeState,
        start(context) {
            equal(context.config.name, "overlay");
            equal(context.secrets.token, 2);
            context.state.starts++;
        },
        handlers: {read: (context) => ({
            dir: context.data.dir,
            config: context.config,
            secrets: context.secrets,
            state: context.state,
        })},
    });
    const peer = defineComponent({
        calls: peer_calls,
        uses: [],
        state: makeState,
        handlers: {read(context) {
            equal(Object.hasOwn(context, "config"), false);
            equal(Object.hasOwn(context, "secrets"), false);
            return context.state;
        }},
    });
    const definition = defineApplication({components: [worker, peer], logger});
    const options = parseArgs([
        "--base-dir", root.path, "--config-dir", "settings", "--secrets-dir", "credentials", "--data-dir", "files", "--env", "test",
    ]);
    const app = createApplication(definition, options);
    const other_app = createApplication(definition, options);

    equal(app.data.dir, join(root.path, "files"));
    equal(app.logger, logger);
    await app.start();
    const first = await app.call(calls.calls.read, {});
    deepEqual(first, {
        dir: join(root.path, "files", "worker"),
        config: {name: "overlay"},
        secrets: {token: 2},
        state: {starts: 1},
    });
    deepEqual(await app.call(peer_calls.calls.read, {}), {starts: 0});
    await app.stop();
    await app.start();
    deepEqual(await app.call(calls.calls.read, {}), {...first, state: {starts: 2}});
    await other_app.start();
    deepEqual(await other_app.call(calls.calls.read, {}), {...first, state: {starts: 1}});
    await app.stop();
    await other_app.stop();
    ok(logs.some((entry) => entry.startsWith("worker: Loaded configuration")));
    ok(logs.some((entry) => entry.startsWith("worker: Loaded secrets")));
    ok(logs.some((entry) => entry.startsWith("worker: Component started")));
    ok(logs.some((entry) => entry.startsWith("peer: Component stopped")));
});

test("invalid startup configuration or secrets prevent every hook from starting", async (t) => {
    const root = await createTemporaryDirectory(t);
    await root.join("config", "second.toml").write().text("value = 0");
    await root.join("secrets", "second.toml").write().text("value = 0");
    let starts = 0;
    const first = defineComponent({
        calls: defineComponentCalls("first", {}),
        uses: [],
        start() { starts++; },
        handlers: {},
    });
    const second = defineComponent({
        calls: defineComponentCalls("second", {}),
        uses: [first.calls],
        config: type({value: "string"}),
        secrets: type({value: "string"}),
        handlers: {},
    });
    const app = createApplication({components: [second, first], logger: quietLogger}, {base_dir: root.path});

    await rejects(app.start(), ConfigValidationError);
    equal(starts, 0);
    await rejects(app.start(), {name: LifecycleStateError.name, operation: "start", current_state: "failed"});
    await app.stop();
    await root.join("config", "second.toml").write().text('value = "valid"');
    await rejects(app.start(), SecretsValidationError);
    equal(starts, 0);
    await app.stop();
    await root.join("secrets", "second.toml").write().text('value = "valid"');
    await app.start();
    equal(starts, 1);
    await app.stop();
});

test("a failed start leaves completed components for reverse-order cleanup", async () => {
    const events: string[] = [];
    const start_error = new Error("start failed");
    const first_error = new Error("first cleanup failed");
    const second_error = new Error("second cleanup failed");
    const first = defineComponent({
        calls: defineComponentCalls("first", {read: ReadNumber}),
        uses: [],
        start() { events.push("start first"); },
        stop() { events.push("stop first"); throw first_error; },
        handlers: {read: () => 1},
    });
    const second = defineComponent({
        calls: defineComponentCalls("second", {}),
        uses: [first.calls],
        async stop(context) {
            equal(await context.call(first.calls.calls.read, {}), 1);
            events.push("stop second");
            throw second_error;
        },
        handlers: {},
    });
    const third = defineComponent({
        calls: defineComponentCalls("third", {}),
        uses: [second.calls],
        async start() { events.push("start third"); throw start_error; },
        stop() { events.push("stop third"); },
        handlers: {},
    });
    const app = createApplication({components: [third, second, first], logger: quietLogger});

    await rejects(app.stop(), {name: LifecycleStateError.name, operation: "stop", current_state: "idle"});
    await rejects(app.start(), (error) => error === start_error);
    await rejects(app.stop(), {name: "AggregateError", errors: [second_error, first_error]});
    deepEqual(events, ["start first", "start third", "stop second", "stop first"]);
    await rejects(app.stop(), {name: LifecycleStateError.name, operation: "stop", current_state: "idle"});
});

test("application operations reject during pending start and stop hooks", async () => {
    const starting = Promise.withResolvers<void>();
    const stopping = Promise.withResolvers<void>();
    const calls = defineComponentCalls("worker", {read: ReadNumber});
    const worker = defineComponent({
        calls,
        uses: [],
        start: () => starting.promise,
        stop: () => stopping.promise,
        handlers: {read: () => 0},
    });
    const app = createApplication({components: [worker], logger: quietLogger});

    const start = app.start();
    await rejects(app.start(), {name: LifecycleStateError.name, operation: "start", current_state: "starting"});
    await rejects(app.stop(), {name: LifecycleStateError.name, operation: "stop", current_state: "starting"});
    await rejects(app.call(calls.calls.read, {}), {name: LifecycleStateError.name, operation: "call", current_state: "starting"});
    starting.resolve();
    await start;
    equal(await app.call(calls.calls.read, {}), 0);

    const stop = app.stop();
    await rejects(app.start(), {name: LifecycleStateError.name, operation: "start", current_state: "stopping"});
    await rejects(app.stop(), {name: LifecycleStateError.name, operation: "stop", current_state: "stopping"});
    await rejects(app.call(calls.calls.read, {}), {name: LifecycleStateError.name, operation: "call", current_state: "stopping"});
    stopping.resolve();
    await stop;
});

test("start and stop hooks can call started dependencies and withdraw local values", async () => {
    type Listener = () => void;
    const calls = defineComponentCalls("storage", {
        add: {input: defineLocalInput<Listener>(), output: type("number")},
        remove: {input: defineLocalInput<Listener>(), output: type("boolean")},
    });
    const bridge_calls = defineComponentCalls("bridge", {
        add: {input: defineLocalInput<Listener>(), output: type("number")},
        remove: {input: defineLocalInput<Listener>(), output: type("boolean")},
    });
    const storage = defineComponent({
        calls,
        uses: [],
        state: () => new Set<Listener>(),
        handlers: {
            add: ({state}, listener) => state.add(listener).size,
            remove: ({state}, listener) => state.delete(listener),
        },
        stop({state}) {
            equal(state.size, 0);
        },
    });
    const bridge = defineComponent({
        calls: bridge_calls,
        uses: [calls],
        handlers: {
            async add(context, listener) {
                await Promise.resolve();
                return context.call(calls.calls.add, listener);
            },
            remove: (context, listener) => context.call(calls.calls.remove, listener),
        },
    });
    const worker = defineComponent({
        calls: defineComponentCalls("worker", {}),
        uses: [bridge_calls],
        state: () => ({listener() {}}),
        handlers: {},
        async start(context) {
            equal(await context.call(bridge_calls.calls.add, context.state.listener), 1);
        },
        async stop(context) {
            equal(await context.call(bridge_calls.calls.remove, context.state.listener), true);
        },
    });
    const app = createApplication({components: [worker, bridge, storage], logger: quietLogger});

    await app.start();
    await app.stop();
});

test("hook call permission stays in the running hook and expires when it settles", async () => {
    const calls = defineComponentCalls("storage", {read: ReadNumber});
    const storage = defineComponent({calls, uses: [], handlers: {read: () => 1}});
    const release_detached = Promise.withResolvers<void>();
    const detached_call = Promise.withResolvers<PromiseSettledResult<number>>();
    const enter_second = Promise.withResolvers<void>();
    const finish_second = Promise.withResolvers<void>();
    const captured_call = Promise.withResolvers<() => Promise<number>>();
    const first = defineComponent({
        calls: defineComponentCalls("first", {}),
        uses: [calls],
        handlers: {},
        start(context) {
            const read = () => context.call(calls.calls.read, {});
            captured_call.resolve(read);
            void release_detached.promise.then(async () => {
                const [result] = await Promise.allSettled([read()]);
                detached_call.resolve(result);
            });
        },
    });
    const second = defineComponent({
        calls: defineComponentCalls("second", {}),
        uses: [first.calls, calls],
        handlers: {},
        async start(context) {
            enter_second.resolve();
            await finish_second.promise;
            equal(await context.call(calls.calls.read, {}), 1);
        },
    });
    const app = createApplication({components: [second, first, storage], logger: quietLogger});

    const start = app.start();
    await enter_second.promise;
    try {
        const read = await captured_call.promise;
        await rejects(read(), {name: LifecycleStateError.name, operation: "call", current_state: "starting"});
        release_detached.resolve();
        const result = await detached_call.promise;
        equal(result.status, "rejected");
        if(result.status === "rejected") {
            ok(result.reason instanceof LifecycleStateError);
            equal(result.reason.current_state, "starting");
        }
    } finally {
        finish_second.resolve();
        await start;
        await app.stop();
    }
});

test("dispatch validates input, preserves output errors, and checks reference identity", async () => {
    const input_error = new Error("input failure");
    const output_error = new Error("output failure");
    const Input = type("string").pipe((text) => {
        if(text === "bad") {
            throw input_error;
        }
        return text.length;
    });
    const Output = type("number").pipe((value) => {
        if(value === 4) {
            throw output_error;
        }
        return String(value);
    });
    const public_calls = defineComponentCalls("worker", {count: {input: Input, output: Output}});
    const extra_calls = defineComponentCalls("worker", {extra: ReadNumber});
    const local_calls = defineComponentCalls("client", {
        forward: {input: Input.in, output: type("string")},
        forwardCopy: {input: Input.in, output: type("string")},
        local: {input: defineLocalInput<object>(), output: defineLocalOutput<object>()},
        undeclared: ReadNumber,
    });
    let count_calls = 0;
    const count_handler = {
        step: 1,
        handle(_context: unknown, input: number) { count_calls++; return input + this.step; },
    };
    const worker = defineComponent({
        calls: mergeComponentCalls(public_calls, extra_calls),
        uses: [],
        handlers: {
            count: count_handler,
            extra: () => 0,
        },
    });
    const client = defineComponent({
        calls: local_calls,
        uses: [public_calls],
        handlers: {
            forward: (context, input) => context.call(public_calls.calls.count, input),
            forwardCopy: (context, input) => context.call({...public_calls.calls.count}, input),
            local: (context, input) => {
                equal(Object.hasOwn(context, "state"), false);
                return input;
            },
            // @ts-expect-error The extra call is registered but outside this component's uses.
            undeclared: (context) => context.call(extra_calls.calls.extra, {}),
        },
    });
    const app = createApplication(defineApplication({components: [client, worker], logger: quietLogger}));
    await rejects(app.call(public_calls.calls.count, "hey"), {name: LifecycleStateError.name, operation: "call", current_state: "idle"});
    await app.start();
    const count: string = await app.call(local_calls.calls.forward, "hi");
    equal(count, "3");
    await rejects(app.call(public_calls.calls.count, "bad"), {
        name: CallInputError.name, component_id: "worker", call_name: "count", cause: input_error,
    });
    equal(count_calls, 1);
    await rejects(app.call(public_calls.calls.count, "hey"), (error) => error === output_error);
    await rejects(app.call(local_calls.calls.undeclared, {}), {
        name: UndeclaredCallError.name, caller_id: "client", component_id: "worker", call_name: "extra",
    });
    await rejects(app.call(local_calls.calls.forwardCopy, "hi"), {
        name: UndeclaredCallError.name, caller_id: "client", component_id: "worker", call_name: "count",
    });
    await rejects(app.call({...public_calls.calls.count}, "hi"), {
        name: UnregisteredCallError.name, component_id: "worker", call_name: "count",
    });
    const outside = defineComponentCalls("outside", {read: ReadNumber});
    // @ts-expect-error The application's definition determines the accepted references.
    await rejects(app.call(outside.calls.read, {}), UnregisteredCallError);
    // @ts-expect-error The caller supplies a string before the input schema morphs it.
    await rejects(app.call(public_calls.calls.count, 10), CallInputError);
    const value = {callback: () => 1};
    equal(await app.call(local_calls.calls.local, value), value);
    await app.stop();
});
