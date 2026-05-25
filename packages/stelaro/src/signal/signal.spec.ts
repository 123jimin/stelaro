import assert from "node:assert/strict";
import {afterEach, describe, it, mock} from "node:test";

import {attachSignalHandlers} from "./signal.ts";

function createApp(stop_impl?: () => Promise<void>) {
    return {stop: mock.fn(stop_impl ?? (() => Promise.resolve()))};
}

function mockLogger() {
    return {
        debug: mock.fn(),
        info: mock.fn(),
        warn: mock.fn(),
        error: mock.fn(),
    };
}

describe("attachSignalHandlers", () => {
    let cleanup: (() => void) | null = null;

    afterEach(() => {
        cleanup?.();
        cleanup = null;
        mock.restoreAll();
    });

    function suppressExit() {
        return mock.method(process, "exit", (() => {}) as unknown as typeof process.exit);
    }

    it("calls stop on SIGINT", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app);

        process.emit("SIGINT", "SIGINT");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("calls stop on SIGTERM", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app);

        process.emit("SIGTERM", "SIGTERM");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("ignores repeated signals while stopping", () => {
        suppressExit();
        const app = createApp(() => new Promise(() => {}));
        cleanup = attachSignalHandlers(app, {timeout: null});

        process.emit("SIGINT", "SIGINT");
        process.emit("SIGINT", "SIGINT");
        process.emit("SIGTERM", "SIGTERM");

        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("exits with code 0 after successful stop", async () => {
        const exit = suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app);

        process.emit("SIGINT", "SIGINT");
        await new Promise((resolve) => { setTimeout(resolve, 10); });

        assert.equal(exit.mock.callCount(), 1);
        assert.deepEqual(exit.mock.calls[0]!.arguments, [0]);
    });

    it("exits with code 1 after failed stop", async () => {
        const exit = suppressExit();
        const app = createApp(() => Promise.reject(new Error("stop failed")));
        cleanup = attachSignalHandlers(app);

        process.emit("SIGINT", "SIGINT");
        await new Promise((resolve) => { setTimeout(resolve, 10); });

        assert.equal(exit.mock.callCount(), 1);
        assert.deepEqual(exit.mock.calls[0]!.arguments, [1]);
    });

    it("exits with code 1 on timeout", async () => {
        const exit = suppressExit();
        const app = createApp(() => new Promise(() => {}));
        cleanup = attachSignalHandlers(app, {timeout: 50});

        process.emit("SIGINT", "SIGINT");
        await new Promise((resolve) => { setTimeout(resolve, 100); });

        assert.equal(exit.mock.callCount(), 1);
        assert.deepEqual(exit.mock.calls[0]!.arguments, [1]);
    });

    it("does not timeout when timeout is null", async () => {
        const exit = suppressExit();
        const app = createApp(() => new Promise(() => {}));
        cleanup = attachSignalHandlers(app, {timeout: null});

        process.emit("SIGINT", "SIGINT");
        await new Promise((resolve) => { setTimeout(resolve, 50); });

        assert.equal(exit.mock.callCount(), 0);
    });

    it("cleanup removes signal listeners", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app);

        cleanup();
        cleanup = null;
        process.emit("SIGINT", "SIGINT");

        assert.equal(app.stop.mock.callCount(), 0);
    });

    it("uses app.logger when available", () => {
        suppressExit();
        const logger = mockLogger();
        const factory = mock.fn(() => logger);
        const app = {stop: mock.fn(() => Promise.resolve()), logger: factory};
        cleanup = attachSignalHandlers(app);

        assert.equal(factory.mock.callCount(), 1);
        assert.deepEqual(factory.mock.calls[0]!.arguments, ["signal"]);

        process.emit("SIGINT", "SIGINT");
        assert.equal(logger.info.mock.callCount(), 1);
    });

    it("prefers options.logger over app.logger", () => {
        suppressExit();
        const app_logger = mockLogger();
        const options_logger = mockLogger();
        const factory = mock.fn(() => app_logger);
        const app = {stop: mock.fn(() => Promise.resolve()), logger: factory};
        cleanup = attachSignalHandlers(app, {logger: options_logger});

        process.emit("SIGINT", "SIGINT");

        assert.equal(options_logger.info.mock.callCount(), 1);
        assert.equal(app_logger.info.mock.callCount(), 0);
    });

    it("falls back to console logger without app.logger or options.logger", () => {
        suppressExit();
        const app = createApp();
        cleanup = attachSignalHandlers(app);

        // Should not throw — uses consoleLoggerFactory fallback
        process.emit("SIGINT", "SIGINT");
        assert.equal(app.stop.mock.callCount(), 1);
    });

    it("logs error on timeout", async () => {
        suppressExit();
        const logger = mockLogger();
        const app = createApp(() => new Promise(() => {}));
        cleanup = attachSignalHandlers(app, {timeout: 50, logger});

        process.emit("SIGINT", "SIGINT");
        await new Promise((resolve) => { setTimeout(resolve, 100); });

        assert.equal(logger.error.mock.callCount(), 1);
    });
});
