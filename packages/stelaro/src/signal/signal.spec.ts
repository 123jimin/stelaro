import assert from "node:assert/strict";
import {afterEach, describe, it, mock} from "node:test";

import {createApplication, defineApplication} from "../application/application.ts";
import type {Logger} from "../component/logger.ts";
import {attachSignalHandlers, type SignalHandlerOptions} from "./signal.ts";

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
        cleanup = attachSignalHandlers(app, {logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("calls stop on SIGTERM", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app, {logger: mockLogger()});

        process.emit("SIGTERM", "SIGTERM");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("ignores repeated signals while stopping", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app, {logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        process.emit("SIGINT", "SIGINT");
        process.emit("SIGTERM", "SIGTERM");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("exits with code 0 after successful stop", async () => {
        const exit = suppressExit();
        const app = createApp(() => Promise.resolve());
        cleanup = attachSignalHandlers(app, {logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        await flushPromises();

        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[0]]);
    });

    it("logs the failure and exits with code 1 after failed stop", async () => {
        const exit = suppressExit();
        const logger = mockLogger();
        const app = createApp(() => Promise.reject(new Error("stop failed")));
        cleanup = attachSignalHandlers(app, {logger});

        process.emit("SIGINT", "SIGINT");
        await flushPromises();

        assert.equal(logger.error.mock.callCount(), 1);
        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
    });

    it("logs and exits with code 1 when stopping an idle application", async () => {
        const exit = suppressExit();
        const loggers = new Map<string, ReturnType<typeof mockLogger>>();
        const app = createApplication(defineApplication({
            components: [],
            logger: (scope: string): Logger => {
                const logger = mockLogger();
                loggers.set(scope, logger);
                return logger;
            },
        }));
        cleanup = attachSignalHandlers(app);

        process.emit("SIGTERM", "SIGTERM");
        await flushPromises();

        assert.equal(loggers.get("signal")?.error.mock.callCount(), 1);
        assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
    });

    it("logs and exits with code 1 on timeout", () => {
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
        const logger = mockLogger();
        const unset: SignalHandlerOptions = {};
        const cleanup_undefined = attachSignalHandlers(createApp(), {timeout: unset.timeout, logger});
        cleanup = attachSignalHandlers(createApp(), {logger});

        try {
            process.emit("SIGINT", "SIGINT");
            mock.timers.tick(9_999);
            assert.equal(exit.mock.callCount(), 0);

            mock.timers.tick(1);
            assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1], [1]]);
        } finally {
            cleanup_undefined();
        }
    });

    it("does not time out when timeout is null", () => {
        mock.timers.enable({apis: ["setTimeout"]});
        const exit = suppressExit();
        cleanup = attachSignalHandlers(createApp(), {timeout: null, logger: mockLogger()});

        process.emit("SIGINT", "SIGINT");
        mock.timers.tick(2 ** 31);

        assert.equal(exit.mock.callCount(), 0);
    });

    it("rejects an invalid timeout", () => {
        for(const timeout of [-1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
            assert.throws(() => attachSignalHandlers(createApp(), {timeout}), RangeError);
        }
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
            const cleanup_first = attachSignalHandlers(first, {logger: mockLogger()});
            cleanup = attachSignalHandlers(second, {logger: mockLogger()});

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

    it("uses app.logger when available", () => {
        suppressExit();
        const logger = mockLogger();
        const factory = mock.fn(() => logger);
        const app = {stop: mock.fn(() => new Promise<void>(() => {})), logger: factory};
        cleanup = attachSignalHandlers(app);

        assert.deepEqual(factory.mock.calls.map((call) => call.arguments), [["signal"]]);

        process.emit("SIGINT", "SIGINT");
        assert.equal(logger.info.mock.callCount(), 1);
    });

    it("prefers options.logger over app.logger", () => {
        suppressExit();
        const app_logger = mockLogger();
        const options_logger = mockLogger();
        const app = {stop: mock.fn(() => new Promise<void>(() => {})), logger: mock.fn(() => app_logger)};
        cleanup = attachSignalHandlers(app, {logger: options_logger});

        process.emit("SIGINT", "SIGINT");

        assert.equal(options_logger.info.mock.callCount(), 1);
        assert.equal(app_logger.info.mock.callCount(), 0);
    });

    it("falls back to a signal-scoped console logger", () => {
        suppressExit();
        const info = mock.method(console, "info", () => {});
        cleanup = attachSignalHandlers(createApp());

        process.emit("SIGINT", "SIGINT");

        assert.equal(info.mock.callCount(), 1);
        assert.ok(String(info.mock.calls[0]!.arguments[0]).includes("signal"));
    });
});
