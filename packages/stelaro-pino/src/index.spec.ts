import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {format} from "node:util";

import pino from "pino";

import {definePinoLogger} from "./index.ts";

type LogRecord = Record<string, unknown>;

/** Builds a pino root writing to an in-memory sink; returns the adapted factory and captured records. */
function collect(options: pino.LoggerOptions = {}): {
    factory: ReturnType<typeof definePinoLogger>;
    records: () => LogRecord[];
} {
    const lines: string[] = [];
    const root = pino(options, {write(line: string) { lines.push(line); }});
    return {
        factory: definePinoLogger(root),
        records: () => lines.map((line) => JSON.parse(line) as LogRecord),
    };
}

/** The message the default console logger renders for `args`, without its `[scope]` prefix. */
function consoleMessage(args: unknown[]): string {
    return format("[c]", ...args).slice("[c] ".length);
}

describe("definePinoLogger", () => {
    it("tags every record with the component id", () => {
        const {factory, records} = collect();
        factory("my-comp").info("hello");
        const [r] = records();
        assert.ok(r);
        assert.equal(r["component"], "my-comp");
        assert.equal(r["msg"], "hello");
    });

    it("scopes distinct component ids independently", () => {
        const {factory, records} = collect();
        factory("alpha").info("a");
        factory("beta").info("b");
        const [ra, rb] = records();
        assert.ok(ra);
        assert.ok(rb);
        assert.equal(ra["component"], "alpha");
        assert.equal(rb["component"], "beta");
    });

    it("preserves caller-configured root bindings", () => {
        const {factory, records} = collect({base: {service: "svc"}});
        factory("my-comp").info("hi");
        const [r] = records();
        assert.ok(r);
        assert.equal(r["service"], "svc");
        assert.equal(r["component"], "my-comp");
    });

    it("exposes a pino child bound to the component, as the component's logger is", () => {
        const {factory, records} = collect();
        factory.childPinoLogger("my-comp").info({url: "/"}, "request");
        factory("my-comp").info("hello");
        const [child, adapted] = records();
        assert.ok(child);
        assert.ok(adapted);
        assert.equal(child["component"], "my-comp");
        assert.equal(adapted["component"], "my-comp");
        assert.equal(child["url"], "/");
    });

    it("merges a leading object and uses the remaining arguments as the message", () => {
        const {factory, records} = collect();
        factory("c").info({user_id: 7}, "logged in");
        const [r] = records();
        assert.ok(r);
        assert.equal(r["user_id"], 7);
        assert.equal(r["msg"], "logged in");
    });

    it("composes all arguments into the message when none is a leading object", () => {
        const {factory, records} = collect();
        factory("c").info("count", 5);
        const [r] = records();
        assert.ok(r);
        assert.equal(r["msg"], "count 5");
    });

    it("composes the message as the console logger renders it after its prefix", () => {
        const cases: unknown[][] = [
            ["x=%d", 5],
            ["100%", "done"],
            ["nested", {a: {b: {c: {d: 1}}}}],
            [5, "items"],
        ];
        const {factory, records} = collect();
        for(const args of cases) factory("c").info(...args);
        assert.deepEqual(records().map((r) => r["msg"]), cases.map(consoleMessage));
    });

    it("composes a leading null into the message", () => {
        const {factory, records} = collect();
        factory("c").info(null, "x");
        const [r] = records();
        assert.ok(r);
        assert.equal(r["msg"], consoleMessage([null, "x"]));
    });

    it("composes every argument after a leading object into the message", () => {
        const {factory, records} = collect();
        factory("c").info({a: 1}, "x=%d", 2);
        const [r] = records();
        assert.ok(r);
        assert.equal(r["a"], 1);
        assert.equal(r["msg"], consoleMessage(["x=%d", 2]));
    });

    it("treats a leading array as message content, not a merge target", () => {
        const {factory, records} = collect();
        factory("c").info(["a", "b"]);
        const [r] = records();
        assert.ok(r);
        assert.ok(!("0" in r), "array indices must not leak into the record");
        assert.equal(r["msg"], consoleMessage([["a", "b"]]));
    });

    it("maps each method to the matching pino level", () => {
        const {factory, records} = collect({level: "debug"});
        const log = factory("c");
        log.debug("d");
        log.info("i");
        log.warn("w");
        log.error("e");
        assert.deepEqual(records().map((r) => r["level"]), [20, 30, 40, 50]);
    });

    it("applies root serializers to component records", () => {
        const {factory, records} = collect({serializers: {user: (user: {id: number}) => user.id}});
        factory("c").info({user: {id: 7, name: "x"}}, "hi");
        const [r] = records();
        assert.ok(r);
        assert.equal(r["user"], 7);
    });

    it("emits pino structured error records for Error arguments", () => {
        const {factory, records} = collect();
        factory("c").error(new Error("boom"));
        const [r] = records();
        assert.ok(r);
        assert.equal(r["level"], 50);
        const err = r["err"] as LogRecord | undefined;
        assert.equal(err?.["type"], "Error");
        assert.equal(err?.["message"], "boom");
    });

    it("filters records below the pino instance level", () => {
        const {factory, records} = collect({level: "warn"});
        const log = factory("c");
        log.info("suppressed");
        log.warn("kept");
        const captured = records();
        assert.equal(captured.length, 1);
        const [r] = captured;
        assert.ok(r);
        assert.equal(r["level"], 40);
        assert.equal(r["msg"], "kept");
        assert.equal(r["component"], "c");
    });
});
