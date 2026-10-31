import assert from "node:assert/strict";
import {describe, it, mock} from "node:test";
import {format} from "node:util";

import {consoleLoggerFactory, type LoggerFactory} from "@jiminp/stelaro";
import pino from "pino";

import {definePinoLogger, type PinoLoggerFactory} from "./index.ts";

type LogRecord = Record<string, unknown>;

/** Builds a pino root that writes to an in-memory sink. */
function collect(options: pino.LoggerOptions = {}): {
    root: pino.Logger;
    factory: PinoLoggerFactory;
    records: () => LogRecord[];
} {
    const lines: string[] = [];
    const root = pino(options, {write(line: string) { lines.push(line); }});
    return {
        root,
        factory: definePinoLogger(root),
        records: () => lines.map((line) => JSON.parse(line) as LogRecord),
    };
}

/** The default console logger's message for `args`, without its scope prefix. A call with no arguments prints the prefix alone. */
function consoleMessage(args: unknown[]): string {
    const info = mock.method(console, "info", () => {});
    try {
        const log = consoleLoggerFactory("c");
        log.info();
        log.info(...args);
        const [prefix_line, line] = info.mock.calls.map((call) => format(...call.arguments));
        assert.ok(prefix_line != null && line != null);
        return line.slice(prefix_line.length + 1);
    } finally {
        info.mock.restore();
    }
}

describe("definePinoLogger", () => {
    it("is a core LoggerFactory", () => {
        const {factory} = collect();
        factory satisfies LoggerFactory;
        assert.equal(typeof factory("c").info, "function");
    });

    it("tags every record with the component id", () => {
        const {factory, records} = collect({level: "debug"});
        const log = factory("my-comp");
        log.debug("d");
        log.info("i");
        log.warn({a: 1}, "w");
        log.error(new Error("e"));
        assert.deepEqual(records().map((r) => r["component"]), ["my-comp", "my-comp", "my-comp", "my-comp"]);
    });

    it("scopes distinct component ids independently", () => {
        const {factory, records} = collect();
        const alpha = factory("alpha");
        const beta = factory("beta");
        alpha.info("a");
        beta.info("b");
        alpha.info("c");
        assert.deepEqual(records().map((r) => [r["component"], r["msg"]]), [["alpha", "a"], ["beta", "b"], ["alpha", "c"]]);
    });

    it("leaves the root logger's level and bindings unchanged", () => {
        const {root, factory, records} = collect({level: "warn", base: {service: "svc"}});
        const bindings = root.bindings();
        factory("c").warn("child");
        factory.childPinoLogger("c").info("dropped");
        root.warn("root");
        assert.equal(root.level, "warn");
        assert.deepEqual(root.bindings(), bindings);
        const [, root_record] = records();
        assert.ok(root_record);
        assert.equal(root_record["msg"], "root");
        assert.ok(!("component" in root_record));
    });

    it("applies root bindings to component records", () => {
        const {factory, records} = collect({base: {service: "svc"}});
        factory("my-comp").info("hi");
        factory.childPinoLogger("my-comp").info("raw");
        for(const r of records()) {
            assert.equal(r["service"], "svc");
            assert.equal(r["component"], "my-comp");
        }
        assert.equal(records().length, 2);
    });

    it("applies root serializers to component records", () => {
        const {factory, records} = collect({serializers: {user: (user: {id: number}) => user.id}});
        factory("c").info({user: {id: 7, name: "x"}}, "hi");
        factory.childPinoLogger("c").info({user: {id: 8, name: "y"}}, "raw");
        assert.deepEqual(records().map((r) => r["user"]), [7, 8]);
    });

    it("filters records below the root level", () => {
        const {factory, records} = collect({level: "warn"});
        const log = factory("c");
        log.debug("suppressed");
        log.info("suppressed");
        log.warn("kept");
        log.error("kept too");
        factory.childPinoLogger("c").info("suppressed");
        assert.deepEqual(records().map((r) => [r["level"], r["msg"], r["component"]]), [[40, "kept", "c"], [50, "kept too", "c"]]);
    });

    it("maps each method to the matching pino level", () => {
        const {factory, records} = collect({level: "debug"});
        const log = factory("c");
        log.debug("d");
        log.info("i");
        log.warn("w");
        log.error("e");
        assert.deepEqual(records().map((r) => [r["level"], r["msg"]]), [[20, "d"], [30, "i"], [40, "w"], [50, "e"]]);
    });

    describe("childPinoLogger", () => {
        it("returns a pino child bound to the component id", () => {
            const {factory, records} = collect();
            factory.childPinoLogger("my-comp").info({url: "/"}, "request");
            const [r] = records();
            assert.ok(r);
            assert.equal(r["component"], "my-comp");
            assert.equal(r["url"], "/");
            assert.equal(r["msg"], "request");
        });

        it("returns a new child on each call", () => {
            const {factory, records} = collect({level: "info"});
            const first = factory.childPinoLogger("c");
            const second = factory.childPinoLogger("c");
            assert.notEqual(first, second);
            first.level = "error";
            second.info("second");
            factory("c").info("adapted");
            first.info("first");
            assert.deepEqual(records().map((r) => r["msg"]), ["second", "adapted"]);
        });
    });

    describe("message composition", () => {
        it("merges a leading object and uses the remaining arguments as the message", () => {
            const {factory, records} = collect();
            factory("c").info({user_id: 7}, "logged in");
            const [r] = records();
            assert.ok(r);
            assert.equal(r["user_id"], 7);
            assert.equal(r["msg"], "logged in");
        });

        it("merges a lone leading object without composing a message from it", () => {
            const {factory, records} = collect();
            factory("c").info({user_id: 7});
            const [r] = records();
            assert.ok(r);
            assert.equal(r["user_id"], 7);
            assert.ok(r["msg"] == null || r["msg"] === "", `unexpected message ${String(r["msg"])}`);
        });

        it("composes every argument after a leading object as the console logger does", () => {
            const {factory, records} = collect();
            factory("c").info({a: 1}, "x=%d", 2, {b: 3});
            const [r] = records();
            assert.ok(r);
            assert.equal(r["a"], 1);
            assert.ok(!("b" in r));
            assert.equal(r["msg"], consoleMessage(["x=%d", 2, {b: 3}]));
        });

        it("composes all arguments as the console logger does when none is a leading object", () => {
            const circular: Record<string, unknown> = {name: "loop"};
            circular["self"] = circular;
            const cases: unknown[][] = [
                ["count", 5],
                ["x=%d", 5],
                ["100%", "done"],
                ["%s %o", "a"],
                ["nested", {a: {b: {c: {d: 1}}}}],
                [5, "items"],
                [],
                [void 0],
                ["a", void 0, null],
                [Symbol("s"), 1n],
                ["multi\nline", "  spaced  "],
                ["유니코드", "😀"],
                ["self", circular],
                ["failed", new Error("boom")],
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

        it("composes a leading array into the message without merging it", () => {
            const {factory, records} = collect();
            factory("c").info(["a", "b"], "c");
            const [r] = records();
            assert.ok(r);
            assert.ok(!("0" in r), "array indices must not leak into the record");
            assert.equal(r["msg"], consoleMessage([["a", "b"], "c"]));
        });

        it("emits a pino structured error record for a leading Error", () => {
            const {factory, records} = collect();
            factory("c").error(new Error("boom"));
            const [r] = records();
            assert.ok(r);
            assert.equal(r["level"], 50);
            assert.equal(r["component"], "c");
            const err = r["err"] as LogRecord | undefined;
            assert.equal(err?.["type"], "Error");
            assert.equal(err?.["message"], "boom");
            assert.equal(typeof err?.["stack"], "string");
        });

        it("uses the arguments after a leading Error as the message", () => {
            const {factory, records} = collect();
            factory("c").warn(new TypeError("bad input"), "while parsing", 3);
            const [r] = records();
            assert.ok(r);
            assert.equal(r["level"], 40);
            const err = r["err"] as LogRecord | undefined;
            assert.equal(err?.["type"], "TypeError");
            assert.equal(err?.["message"], "bad input");
            assert.equal(r["msg"], consoleMessage(["while parsing", 3]));
        });
    });
});
