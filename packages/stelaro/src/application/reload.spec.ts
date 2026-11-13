import {deepEqual, equal, rejects} from "node:assert/strict";
import {unlink} from "node:fs/promises";
import {test} from "node:test";

import {type} from "arktype";

import type {LoggerFactory} from "../index.ts";
import {
    ConfigFileError, ConfigValidationError, createApplication, defineComponent, defineComponentCalls, defineLocalOutput,
    EmptyInput, LifecycleStateError, UnregisteredComponentError,
} from "../index.ts";
import {createTemporaryDirectory} from "../test-util.ts";

const quietLogger: LoggerFactory = () => ({debug() {}, info() {}, warn() {}, error() {}});
const Config = type({value: "number"});
const ReadValue = {input: EmptyInput, output: type("number")};

test("full reload validates every config before swapping and runs hooks against the new values", async (t) => {
    const root = await createTemporaryDirectory(t);
    const source_config = root.join("config", "source.toml");
    const consumer_config = root.join("config", "consumer.toml");
    const source_secrets = root.join("secrets", "source.toml");
    await Promise.all([
        source_config.write().text("value = 1"),
        consumer_config.write().text("value = 2"),
        source_secrets.write().text("token = 3"),
    ]);
    const source_calls = defineComponentCalls("source", {
        read: ReadValue,
        inspect: {input: EmptyInput, output: defineLocalOutput<{state: object; secrets: object}>()},
    });
    const consumer_calls = defineComponentCalls("consumer", {read: ReadValue});
    const events: string[] = [];
    const source = defineComponent({
        calls: source_calls,
        uses: [],
        config: Config,
        secrets: type({token: "number"}),
        state: () => ({}),
        handlers: {
            read: ({config}) => config.value,
            inspect: ({state, secrets}) => ({state, secrets}),
        },
        onConfigReload({config}) { events.push(`source:${config.value}`); },
    });
    const consumer = defineComponent({
        calls: consumer_calls,
        uses: [source_calls],
        config: Config,
        handlers: {read: ({config}) => config.value},
        async onConfigReload({config, call}) {
            events.push(`consumer:${config.value},${await call(source_calls.calls.read, {})}`);
        },
    });
    const app = createApplication({
        components: [consumer, source], logger: quietLogger,
        onConfigReload() { events.push("application"); },
    }, {base_dir: root.path});
    await app.start();
    const before = await app.call(source_calls.calls.inspect, {});

    await Promise.all([
        source_config.write().text("value = 10"),
        consumer_config.write().text('value = "invalid"'),
        source_secrets.write().text("token = 30"),
    ]);
    await rejects(app.reloadConfig(), {name: ConfigValidationError.name, component_id: "consumer"});
    equal(await app.call(source_calls.calls.read, {}), 1);
    equal(await app.call(consumer_calls.calls.read, {}), 2);
    deepEqual(events, []);

    await consumer_config.write().text("value = 20");
    await app.reloadConfig();
    deepEqual(events, ["source:10", "consumer:20,10", "application"]);
    const after = await app.call(source_calls.calls.inspect, {});
    equal(after.state, before.state);
    equal(after.secrets, before.secrets);
    deepEqual(after.secrets, {token: 3});
    await app.stop();
});

test("full reload waits for concurrent hooks and aggregates their failures", {timeout: 5000}, async () => {
    const first_error = new Error("first hook failed");
    const second_error = new Error("second hook failed");
    const entered = Promise.withResolvers<void>();
    const first_entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let application_called = false;
    const first = defineComponent({
        calls: defineComponentCalls("first", {}), uses: [], handlers: {},
        async onConfigReload() {
            first_entered.resolve();
            await entered.promise;
            throw first_error;
        },
    });
    const second_calls = defineComponentCalls("second", {read: ReadValue});
    const second = defineComponent({
        calls: second_calls, uses: [], handlers: {read: () => 2},
        async onConfigReload() {
            await first_entered.promise;
            entered.resolve();
            await release.promise;
            throw second_error;
        },
    });
    const app = createApplication({
        components: [first, second], logger: quietLogger,
        onConfigReload() { application_called = true; },
    });
    await rejects(app.reloadConfig(), {name: LifecycleStateError.name, current_state: "idle", operation: "reloadConfig"});
    await app.start();
    const reloading = rejects(app.reloadConfig(), {name: "AggregateError", errors: [first_error, second_error]});
    await entered.promise;
    try {
        equal(await app.call(second_calls.calls.read, {}), 2);
        await rejects(app.reloadConfig(), {name: LifecycleStateError.name, current_state: "reloading", operation: "reloadConfig"});
        await rejects(app.reloadComponentConfig("second"), {
            name: LifecycleStateError.name, current_state: "reloading", operation: "reloadComponentConfig",
        });
        await rejects(app.stop(), {name: LifecycleStateError.name, current_state: "reloading", operation: "stop"});
    } finally {
        release.resolve();
        await reloading;
    }
    equal(application_called, false);
    await rejects(app.reloadConfig(), {name: LifecycleStateError.name, current_state: "failed", operation: "reloadConfig"});
    await app.stop();
});

test("targeted reload validates and swaps only the selected config and runs only its hook", async (t) => {
    const root = await createTemporaryDirectory(t);
    const worker_file = root.join("config", "worker.toml");
    const peer_file = root.join("config", "peer.toml");
    await Promise.all([worker_file.write().text("value = 1"), peer_file.write().text("value = 2")]);
    const worker_calls = defineComponentCalls("worker", {read: ReadValue});
    const peer_calls = defineComponentCalls("peer", {read: ReadValue});
    const hook_error = new Error("worker hook failed");
    const events: string[] = [];
    let stopped_value: number | null = null;
    const worker = defineComponent({
        calls: worker_calls, uses: [], config: Config, handlers: {read: ({config}) => config.value},
        onConfigReload({config}) {
            events.push(`worker:${config.value}`);
            if(config.value === 4) {
                throw hook_error;
            }
        },
        stop({config}) { stopped_value = config.value; },
    });
    const peer = defineComponent({
        calls: peer_calls, uses: [], config: Config, handlers: {read: ({config}) => config.value},
        onConfigReload() { events.push("peer"); },
    });
    const app = createApplication({
        components: [worker, peer], logger: quietLogger,
        onConfigReload() { events.push("application"); },
    }, {base_dir: root.path});
    await app.start();
    // @ts-expect-error The component ID must come from the registered component definitions.
    await rejects(app.reloadComponentConfig("unknown"), {name: UnregisteredComponentError.name, component_id: "unknown"});

    await worker_file.write().text('value = "invalid"');
    await rejects(app.reloadComponentConfig("worker"), ConfigValidationError);
    equal(await app.call(worker_calls.calls.read, {}), 1);
    deepEqual(events, []);

    await Promise.all([worker_file.write().text("value = 3"), peer_file.write().text('value = "invalid"')]);
    await app.reloadComponentConfig("worker");
    equal(await app.call(worker_calls.calls.read, {}), 3);
    equal(await app.call(peer_calls.calls.read, {}), 2);
    deepEqual(events, ["worker:3"]);

    await worker_file.write().text("value = 4");
    await rejects(app.reloadComponentConfig("worker"), (error) => error === hook_error);
    await rejects(app.reloadComponentConfig("worker"), {
        name: LifecycleStateError.name, current_state: "failed", operation: "reloadComponentConfig",
    });
    await app.stop();
    equal(stopped_value, 4);
    deepEqual(events, ["worker:3", "worker:4"]);
});

test("reload recovers from a missing config file and fails if the application hook throws", async (t) => {
    const root = await createTemporaryDirectory(t);
    const config_file = root.join("config", "worker.toml");
    await config_file.write().text("value = 1");
    const calls = defineComponentCalls("worker", {read: ReadValue});
    const worker = defineComponent({calls, uses: [], config: Config, handlers: {read: ({config}) => config.value}});
    const hook_error = new Error("application reload hook failed");
    const app = createApplication({
        components: [worker], logger: quietLogger,
        async onConfigReload() { throw hook_error; },
    }, {base_dir: root.path});
    await app.start();
    await unlink(config_file.path);
    await rejects(app.reloadConfig(), ConfigFileError);
    equal(await app.call(calls.calls.read, {}), 1);

    await config_file.write().text("value = 2");
    await rejects(app.reloadConfig(), (error) => error === hook_error);
    await rejects(app.call(calls.calls.read, {}), {name: LifecycleStateError.name, current_state: "failed", operation: "call"});
    await app.stop();
});
