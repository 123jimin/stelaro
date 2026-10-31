import assert from "node:assert/strict";
import {once} from "node:events";
import {extname} from "node:path";
import {afterEach, describe, it, mock} from "node:test";
import {Worker} from "node:worker_threads";

import {createApplication, defineApplication} from "../application/application.ts";
import {attachSignalHandlers} from "./signal.ts";

function createApp(stop_impl: () => Promise<void> = () => new Promise(() => {})) {
    return {stop: mock.fn(stop_impl)};
}

function mockLogger() {
    return {
        debug: mock.fn(),
        info: mock.fn(),
        warn: mock.fn(),
        error: mock.fn(),
    };
}

function flushPromises(): Promise<void> {
    return new Promise((resolve) => { setImmediate(resolve); });
}

describe("attachSignalHandlers", () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
        cleanup?.();
        cleanup = null;
        mock.timers.reset();
        mock.restoreAll();
    });

    function suppressExit() {
        return mock.method(process, "exit", (() => {}) as unknown as typeof process.exit);
    }

    it("calls stop on SIGINT", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app, {timeout: null, logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("calls stop on SIGTERM", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app, {timeout: null, logger: mockLogger()});

        process.emit("SIGTERM", "SIGTERM");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("ignores repeated signals while stopping", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app, {timeout: null, logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        process.emit("SIGINT", "SIGINT");
        process.emit("SIGTERM", "SIGTERM");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("exits with code 0 after successful stop", async () => {
        const exit = suppressExit();
        const app = createApp(() => Promise.resolve());
        cleanup = attachSignalHandlers(app, {timeout: null, logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        await flushPromises();

        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[0]]);
    });

    it("does not exit before stop settles", async () => {
        const exit = suppressExit();
        const stopped = Promise.withResolvers<void>();
        cleanup = attachSignalHandlers(createApp(() => stopped.promise), {timeout: null, logger: mockLogger()});

        process.emit("SIGTERM", "SIGTERM");
        await flushPromises();
        assert.equal(exit.mock.callCount(), 0);

        stopped.resolve();
        await flushPromises();
        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[0]]);
    });

    it("exits with code 1 after failed stop", async () => {
        const exit = suppressExit();
        const app = createApp(() => Promise.reject(new Error("stop failed")));
        cleanup = attachSignalHandlers(app, {timeout: null, logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        await flushPromises();

        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
    });

    it("exits with code 1 when the application is not stoppable", async () => {
        const exit = suppressExit();
        const app = createApplication(defineApplication({components: [], logger: () => mockLogger()}));
        cleanup = attachSignalHandlers(app, {timeout: null});

        process.emit("SIGTERM", "SIGTERM");
        await flushPromises();

        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
    });

    it("logs at error and exits with code 1 on timeout", () => {
        mock.timers.enable({apis: ["setTimeout"]});
        const exit = suppressExit();
        const logger = mockLogger();
        cleanup = attachSignalHandlers(createApp(), {timeout: 50, logger});

        process.emit("SIGINT", "SIGINT");
        mock.timers.tick(49);
        assert.equal(exit.mock.callCount(), 0);

        mock.timers.tick(1);
        assert.equal(logger.error.mock.callCount(), 1);
        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
    });

    it("times out after 10 seconds by default", () => {
        mock.timers.enable({apis: ["setTimeout"]});
        const exit = suppressExit();
        cleanup = attachSignalHandlers(createApp(), {logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        mock.timers.tick(9_999);
        assert.equal(exit.mock.callCount(), 0);

        mock.timers.tick(1);
        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
    });

    it("does not time out when timeout is null", () => {
        mock.timers.enable({apis: ["setTimeout"]});
        const exit = suppressExit();
        cleanup = attachSignalHandlers(createApp(), {timeout: null, logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        mock.timers.tick(2 ** 31);

        assert.equal(exit.mock.callCount(), 0);
    });

    it("cleanup removes only the listeners of its own attachment", () => {
        suppressExit();
        const foreign = mock.fn();
        process.on("SIGINT", foreign);
        const baseline_sigint = process.listenerCount("SIGINT");
        const baseline_sigterm = process.listenerCount("SIGTERM");

        try {
            const first = createApp();
            const second = createApp();
            const cleanup_first = attachSignalHandlers(first, {timeout: null, logger: mockLogger()});
            cleanup = attachSignalHandlers(second, {timeout: null, logger: mockLogger()});

            cleanup_first();
            process.emit("SIGINT", "SIGINT");

            assert.equal(first.stop.mock.callCount(), 0);
            assert.equal(second.stop.mock.callCount(), 1);
            assert.equal(foreign.mock.callCount(), 1);

            cleanup();
            cleanup = null;
            assert.equal(process.listenerCount("SIGINT"), baseline_sigint);
            assert.equal(process.listenerCount("SIGTERM"), baseline_sigterm);
        } finally {
            process.off("SIGINT", foreign);
        }
    });

    it("logs signal receipt at info through a signal-scoped logger from app.logger", () => {
        suppressExit();
        const logger = mockLogger();
        const factory = mock.fn((_scope: string) => logger);
        const app = {stop: mock.fn(() => new Promise<void>(() => {})), logger: factory};
        cleanup = attachSignalHandlers(app, {timeout: null});

        process.emit("SIGINT", "SIGINT");

        assert.ok(factory.mock.callCount() > 0);
        assert.ok(factory.mock.calls.every((call) => call.arguments[0] === "signal"));
        assert.equal(logger.info.mock.callCount(), 1);
    });

    it("prefers options.logger over app.logger", () => {
        suppressExit();
        const app_logger = mockLogger();
        const options_logger = mockLogger();
        const app = {stop: mock.fn(() => new Promise<void>(() => {})), logger: mock.fn(() => app_logger)};
        cleanup = attachSignalHandlers(app, {timeout: null, logger: options_logger});

        process.emit("SIGINT", "SIGINT");

        assert.equal(options_logger.info.mock.callCount(), 1);
        assert.equal(app_logger.info.mock.callCount(), 0);
    });

    it("uses app.logger when options.logger is null", () => {
        suppressExit();
        const app_logger = mockLogger();
        const app = {stop: mock.fn(() => new Promise<void>(() => {})), logger: () => app_logger};
        cleanup = attachSignalHandlers(app, {timeout: null, logger: null});

        process.emit("SIGINT", "SIGINT");

        assert.equal(app_logger.info.mock.callCount(), 1);
    });

    it("logs through a signal-scoped console logger when neither options nor app provides a logger", () => {
        suppressExit();
        const info = mock.method(console, "info", () => {});
        cleanup = attachSignalHandlers(createApp(), {timeout: null});

        process.emit("SIGINT", "SIGINT");

        assert.equal(info.mock.callCount(), 1);
        assert.ok(String(info.mock.calls[0]!.arguments[0]).includes("signal"));
    });

    it("no-ops or reports an Error, without crashing, when attached in a worker thread", async () => {
        // A worker receives no signals. It imports the module next to this one, `.ts` or `.js`.
        const worker = new Worker(`
            const {parentPort, workerData} = require("node:worker_threads");
            import(workerData).then(({attachSignalHandlers}) => {
                try {
                    attachSignalHandlers({stop: () => new Promise(() => {})}, {logger: console})();
                    parentPort.postMessage("no-op");
                } catch (error) {
                    parentPort.postMessage(error instanceof Error ? "reported" : "threw a non-Error");
                }
            });
        `, {eval: true, workerData: new URL(`signal${extname(import.meta.filename)}`, import.meta.url).href});
        const messages: unknown[] = [];
        worker.on("message", (message) => messages.push(message));
        // `once` rejects on the worker's `error` event, e.g. a failed import.
        const [exit_code] = await once(worker, "exit") as [number];

        assert.strictEqual(exit_code, 0);
        assert.ok(messages.length === 1 && ["no-op", "reported"].includes(messages[0] as string), String(messages));
    });
});
