import assert from "node:assert/strict";
import {afterEach, describe, it, mock} from "node:test";

import type {Logger, LoggerFactory} from "../component/logger.ts";
import {defineCounterCalls, defineCounterComponent} from "../test-util.ts";
import {createApplication, defineApplication} from "./application.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type CapturedRecord = {readonly scope: string; readonly level: LogLevel; readonly args: readonly unknown[]};

const log_levels = ["debug", "info", "warn", "error"] as const satisfies readonly LogLevel[];

function capturingLoggerFactory(sink: CapturedRecord[]): LoggerFactory {
    return (scope): Logger => {
        const make = (level: LogLevel) => (...args: unknown[]): void => {
            sink.push({scope, level, args});
        };
        return {debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error")};
    };
}

/** Whether a record names a component, by its scope or anywhere in its arguments. */
function mentions(record: CapturedRecord, component_id: string): boolean {
    if(record.scope === component_id) return true;
    const seen = new Set<unknown>();
    const visit = (value: unknown): boolean => {
        if(value === component_id) return true;
        if(value === null || typeof value !== "object" || seen.has(value)) return false;
        seen.add(value);
        return Object.values(value).some(visit);
    };
    return record.args.some(visit);
}

/** Replaces the console's leveled methods with recorders until the test ends. */
function captureConsole(): CapturedRecord[] {
    const sink: CapturedRecord[] = [];
    for(const level of log_levels) {
        mock.method(console, level, (...args: unknown[]) => { sink.push({scope: "", level, args}); });
    }
    return sink;
}

describe("application lifecycle logging", () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it("logs start, stop, and config reloads through the configured logger", async () => {
        const sink: CapturedRecord[] = [];
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(defineCounterCalls("counter"))],
            logger: capturingLoggerFactory(sink),
        }));

        const steps: readonly (readonly [string, () => Promise<void>])[] = [
            ["start", () => app.start()],
            ["reloadConfig", () => app.reloadConfig()],
            ["reloadComponentConfig", () => app.reloadComponentConfig("counter")],
            ["stop", () => app.stop()],
        ];
        for(const [name, step] of steps) {
            sink.length = 0;
            await step();
            assert.ok(sink.length > 0, `expected ${name} to log`);
        }
    });

    it("logs each component's start and stop through the configured logger", async () => {
        const sink: CapturedRecord[] = [];
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(defineCounterCalls("first")), defineCounterComponent(defineCounterCalls("second"))],
            logger: capturingLoggerFactory(sink),
        }));

        for(const step of [() => app.start(), () => app.stop()]) {
            sink.length = 0;
            await step();
            for(const component_id of ["first", "second"]) {
                assert.ok(sink.some((record) => mentions(record, component_id)), component_id);
            }
        }
    });

    it("logs a failed component start through the configured logger", async () => {
        const sink: CapturedRecord[] = [];
        let records_before_failure = 0;
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(defineCounterCalls("broken"), {
                start() {
                    records_before_failure = sink.length;
                    throw new Error("start failed");
                },
            })],
            logger: capturingLoggerFactory(sink),
        }));

        await assert.rejects(app.start(), /start failed/);

        assert.ok(sink.slice(records_before_failure).some((record) => mentions(record, "broken")));
    });

    it("writes nothing to the console when a logger factory is configured", async () => {
        const console_sink = captureConsole();
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(defineCounterCalls("counter"), {stop() { throw new Error("stop failed"); }})],
            logger: capturingLoggerFactory([]),
        }));

        await app.start();
        await app.reloadConfig();
        await assert.rejects(app.stop());

        assert.deepStrictEqual(console_sink, []);
    });

    it("logs lifecycle transitions to the console when no logger factory is configured", async () => {
        const console_sink = captureConsole();
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(defineCounterCalls("counter"))],
        }));

        for(const step of [() => app.start(), () => app.reloadConfig(), () => app.stop()]) {
            console_sink.length = 0;
            await step();
            assert.ok(console_sink.length > 0);
        }
    });

    it("exposes the configured logger factory, and otherwise a console logger factory", () => {
        const factory = capturingLoggerFactory([]);
        assert.strictEqual(createApplication(defineApplication({components: [], logger: factory})).logger, factory);

        const console_sink = captureConsole();
        createApplication(defineApplication({components: []})).logger("custom").warn("message");

        assert.strictEqual(console_sink.length, 1);
        assert.strictEqual(console_sink[0]!.level, "warn");
        assert.ok(console_sink[0]!.args.includes("message"));
    });
});
