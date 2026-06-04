import assert from "node:assert/strict";
import {describe, it} from "node:test";

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

describe("definePinoLogger", () => {
    it("produces a component-scoped logger exposing all four levels", () => {
        const {factory} = collect();
        const log = factory("my-comp");
        for(const level of ["debug", "info", "warn", "error"] as const) {
            assert.equal(typeof log[level], "function");
        }
    });

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

    it("applies printf-style format specifiers in the message", () => {
        const {factory, records} = collect();
        factory("c").info("x=%d", 5);
        const [r] = records();
        assert.ok(r);
        assert.equal(r["msg"], "x=5");
    });

    it("treats a leading array as message content, not a merge target", () => {
        const {factory, records} = collect();
        factory("c").info(["a", "b"]);
        const [r] = records();
        assert.ok(r);
        assert.ok(!("0" in r), "array indices must not leak into the record");
        assert.match(String(r["msg"]), /a/);
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
