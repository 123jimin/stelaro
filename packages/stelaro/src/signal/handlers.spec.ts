import {deepEqual, equal, match} from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {once} from "node:events";
import process from "node:process";
import {test} from "node:test";
import {Worker} from "node:worker_threads";

import {attachSignalHandlers, createApplication} from "../index.ts";

const entry_point = JSON.stringify(import.meta.resolve("../index.js"));

function runChild(script: string) {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
        import assert from "node:assert/strict";
        import {writeSync} from "node:fs";
        import process from "node:process";
        import {mock} from "node:test";
        import {attachSignalHandlers, createApplication, defineComponent, defineComponentCalls} from ${entry_point};

        const write = (message) => writeSync(1, message + "\\n");
        const emitSignal = (signal) => process.emit(signal, signal);
        const sendSignal = (signal) => process.platform === "win32" ? emitSignal(signal) : process.kill(process.pid, signal);
        ${script}
    `], {encoding: "utf8", timeout: 5_000});
    if(result.error != null) {
        throw result.error;
    }
    equal(result.signal, null, result.stderr);
    return result;
}

test("signal handling is opt-in and cleanup only removes its own listeners", (t) => {
    const signals = ["SIGINT", "SIGTERM"] as const;
    const existing_listeners = signals.map((signal) => process.listeners(signal));
    const app = createApplication({components: []});
    deepEqual(signals.map((signal) => process.listeners(signal)), existing_listeners);

    const unrelatedListener = () => {};
    const first_cleanup = attachSignalHandlers(app);
    const second_cleanup = attachSignalHandlers(app);
    t.after(() => {
        first_cleanup();
        second_cleanup();
        for(const signal of signals) {
            process.off(signal, unrelatedListener);
        }
    });

    const installed_listeners = signals.map((signal) => process.listeners(signal));
    deepEqual(installed_listeners.map((listeners) => listeners.length), existing_listeners.map(({length}) => length + 2));
    for(const signal of signals) {
        process.on(signal, unrelatedListener);
    }
    first_cleanup();
    first_cleanup();
    deepEqual(signals.map((signal) => process.listeners(signal)), installed_listeners.map((listeners) => [
        ...listeners.slice(0, -2), listeners.at(-1), unrelatedListener,
    ]));
    second_cleanup();
    deepEqual(signals.map((signal) => process.listeners(signal)), existing_listeners.map((listeners) => [...listeners, unrelatedListener]));
});

test("an unsupported signal leaves no listeners from the attachment", (t) => {
    const existing_listeners = [process.listeners("SIGINT"), process.listeners("SIGTERM")];
    const originalOn = process.on;
    t.mock.method(process, "on", function (this: NodeJS.Process, event: string, listener: () => void) {
        if(event === "SIGTERM") {
            throw new Error("Signal unavailable");
        }
        return originalOn.call(this, event, listener);
    });
    const cleanup = attachSignalHandlers({stop: () => Promise.resolve()});
    deepEqual([process.listeners("SIGINT"), process.listeners("SIGTERM")], existing_listeners);
    cleanup();
});

test("SIGINT stops the application once and exits with code 0", () => {
    const {status, stdout, stderr} = runChild(`
        const component = defineComponent({
            calls: defineComponentCalls("worker", {}),
            uses: [],
            handlers: {},
            stop() {
                write("stop");
                emitSignal("SIGINT");
                emitSignal("SIGTERM");
            },
        });
        const app = createApplication({components: [component], logger: (scope) => ({
            debug() {}, info(message) { write(scope + " info: " + message); }, warn() {}, error() {},
        })});
        await app.start();
        attachSignalHandlers(app);
        setInterval(() => {}, 1_000);
        sendSignal("SIGINT");
    `);
    equal(status, 0, stderr);
    equal(stdout, "signal info: Received SIGINT. Stopping the application.\nstop\n");
});

test("SIGTERM exits with code 1 when the application's stop rejects", () => {
    const {status, stdout, stderr} = runChild(`
        const app = createApplication({components: [], logger: () => assert.fail("Unexpected logger factory call")});
        attachSignalHandlers(app, {logger: {
            debug() {}, info(message) { write("override info: " + message); }, warn() {},
            error(_message, error) { write("override error: " + error.name); },
        }});
        setInterval(() => {}, 1_000);
        sendSignal("SIGTERM");
    `);
    equal(status, 1, stderr);
    equal(stdout, "override info: Received SIGTERM. Stopping the application.\noverride error: LifecycleStateError\n");
});

test("a custom timeout logs an error and forces exit with code 1", () => {
    const {status, stdout, stderr} = runChild(`
        attachSignalHandlers({stop: () => new Promise(() => {})}, {timeout_ms: 25});
        emitSignal("SIGTERM");
    `);
    equal(status, 1, stderr);
    match(stdout, /\[signal\] Received SIGTERM/);
    match(stderr, /\[signal\] Application shutdown timed out after 25 ms/);
});

test("the default timeout expires after 10 seconds", () => {
    const {status, stdout, stderr} = runChild(`
        mock.timers.enable({apis: ["setTimeout"]});
        attachSignalHandlers({stop: () => new Promise(() => {})});
        emitSignal("SIGINT");
        mock.timers.tick(9_999);
        write("still stopping");
        mock.timers.tick(1);
        assert.fail("Expected the shutdown timeout to exit");
    `);
    equal(status, 1, stderr);
    match(stdout, /still stopping/);
    match(stderr, /\[signal\] Application shutdown timed out after 10000 ms/);
});

test("null allows shutdown to continue past the default timeout", () => {
    const {status, stdout, stderr} = runChild(`
        mock.timers.enable({apis: ["setTimeout"]});
        const shutdown = Promise.withResolvers();
        attachSignalHandlers({stop: () => shutdown.promise}, {timeout_ms: null});
        emitSignal("SIGINT");
        mock.timers.tick(10_001);
        write("finished stopping");
        setInterval(() => {}, 1_000);
        shutdown.resolve();
    `);
    equal(status, 0, stderr);
    match(stdout, /finished stopping/);
});

test("attaching in a worker is a no-op", {timeout: 5_000}, async (t) => {
    const worker = new Worker(`
        const {parentPort} = require("node:worker_threads");
        import(${entry_point}).then(({attachSignalHandlers}) => {
            const cleanup = attachSignalHandlers({stop() { throw new Error("Unexpected stop"); }});
            parentPort.postMessage([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]);
            cleanup();
        });
    `, {eval: true});
    t.after(() => worker.terminate());
    const [counts] = await once(worker, "message");
    deepEqual(counts, [0, 0]);
});
