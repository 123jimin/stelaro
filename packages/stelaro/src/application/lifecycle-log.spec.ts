import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {defineComponent, defineComponentCalls} from "../component/component.ts";
import type {Logger, LoggerFactory} from "../component/logger.ts";
import {CounterOutput, EmptyInput} from "../test-util.ts";
import {createApplication, defineApplication, FRAMEWORK_NAME} from "./application.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type CapturedRecord = {readonly scope: string; readonly level: LogLevel; readonly args: readonly unknown[]};

function capturingLoggerFactory(sink: CapturedRecord[]): LoggerFactory {
    return (component_id): Logger => {
        const make = (level: LogLevel) => (...args: unknown[]): void => {
            sink.push({scope: component_id, level, args});
        };
        return {debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error")};
    };
}

/** Extracts the leading merge object (structured fields) from a captured record, if any. */
function fieldsOf(record: CapturedRecord): Record<string, unknown> {
    const first = record.args[0];
    return first !== null && typeof first === "object" && !Array.isArray(first)
        ? first as Record<string, unknown>
        : {};
}

function eventsFor(sink: readonly CapturedRecord[], scope: string, level: LogLevel): string[] {
    return sink
        .filter((record) => record.scope === scope && record.level === level)
        .map((record) => fieldsOf(record)["event"])
        .filter((event): event is string => typeof event === "string");
}

function counterComponent(id: string) {
    return defineComponent({
        calls: defineComponentCalls(id, {current: {input: EmptyInput, output: CounterOutput}}),
        uses: [],
        handlers: {current: {handle() { return {count: 1}; }}},
    });
}

describe("application lifecycle logging", () => {
    it("logs application start and stop transitions at info under the framework scope", async () => {
        const sink: CapturedRecord[] = [];
        const app = createApplication(defineApplication({
            components: [counterComponent("counter")],
            logger: capturingLoggerFactory(sink),
        }));

        await app.start();
        await app.stop();

        assert.deepStrictEqual(
            eventsFor(sink, FRAMEWORK_NAME, "info"),
            ["app.starting", "app.active", "app.stopping", "app.idle"],
        );
    });

    it("logs component start and stop transitions at debug under the component scope", async () => {
        const sink: CapturedRecord[] = [];
        const app = createApplication(defineApplication({
            components: [counterComponent("counter")],
            logger: capturingLoggerFactory(sink),
        }));

        await app.start();
        await app.stop();

        assert.deepStrictEqual(
            eventsFor(sink, "counter", "debug"),
            ["component.starting", "component.active", "component.stopping", "component.idle"],
        );
    });

    it("carries a non-negative numeric duration on terminal start/stop records", async () => {
        const sink: CapturedRecord[] = [];
        const app = createApplication(defineApplication({
            components: [counterComponent("counter")],
            logger: capturingLoggerFactory(sink),
        }));

        await app.start();
        await app.stop();

        const terminal = sink.filter((record) => {
            const event = fieldsOf(record)["event"];
            return event === "app.active" || event === "app.idle"
                || event === "component.active" || event === "component.idle";
        });
        assert.ok(terminal.length >= 4);
        for(const record of terminal) {
            const ms = fieldsOf(record)["ms"];
            assert.deepStrictEqual(typeof ms, "number");
            assert.ok((ms as number) >= 0);
        }
    });

    it("logs a start failure at error under both the component and framework scopes", async () => {
        const sink: CapturedRecord[] = [];
        const boom = new Error("start boom");
        const Failing = defineComponent({
            calls: defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}}),
            uses: [],
            handlers: {current: {handle() { return {count: 1}; }}},
            start() { throw boom; },
        });
        const app = createApplication(defineApplication({
            components: [Failing],
            logger: capturingLoggerFactory(sink),
        }));

        await assert.rejects(app.start(), /start boom/);

        const component_failed = sink.find((record) =>
            record.scope === "counter" && record.level === "error" && fieldsOf(record)["event"] === "component.failed");
        const app_failed = sink.find((record) =>
            record.scope === FRAMEWORK_NAME && record.level === "error" && fieldsOf(record)["event"] === "app.failed");

        assert.ok(component_failed, "expected a component.failed error record");
        assert.ok(app_failed, "expected an app.failed error record");
        assert.deepStrictEqual(fieldsOf(component_failed)["err"], boom);
    });

    it("logs config reload transitions at info under the framework scope", async () => {
        const sink: CapturedRecord[] = [];
        const app = createApplication(defineApplication({
            components: [counterComponent("counter")],
            logger: capturingLoggerFactory(sink),
        }));

        await app.start();
        sink.length = 0;
        await app.reloadConfig();

        assert.deepStrictEqual(
            eventsFor(sink, FRAMEWORK_NAME, "info"),
            ["app.reloading", "app.active"],
        );
    });

    it("identifies the target component when reloading a single component's config", async () => {
        const sink: CapturedRecord[] = [];
        const app = createApplication(defineApplication({
            components: [counterComponent("counter")],
            logger: capturingLoggerFactory(sink),
        }));

        await app.start();
        sink.length = 0;
        await app.reloadComponentConfig("counter");

        const reloading = sink.find((record) =>
            record.scope === FRAMEWORK_NAME && fieldsOf(record)["event"] === "app.reloading");
        assert.ok(reloading, "expected an app.reloading record");
        assert.deepStrictEqual(fieldsOf(reloading)["component_id"], "counter");
    });
});
