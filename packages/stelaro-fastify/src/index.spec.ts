import assert from "node:assert/strict";
import {describe, it} from "node:test";

import type {FastifyInstance} from "fastify";

import {defineFastifyGateway} from "./index.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type CapturedRecord = {readonly level: LogLevel; readonly fields: Record<string, unknown>};

/** A fastify stand-in that records listen/close without binding a real port. */
function fakeServer(): FastifyInstance {
    return {
        listen() { return Promise.resolve("http://127.0.0.1:0"); },
        close() { return Promise.resolve(); },
    } as unknown as FastifyInstance;
}

function capturingContext(captured: CapturedRecord[]) {
    const make = (level: LogLevel) => (...args: unknown[]): void => {
        const first = args[0];
        const fields = first !== null && typeof first === "object" && !Array.isArray(first)
            ? first as Record<string, unknown>
            : {};
        captured.push({level, fields});
    };
    return {
        log: {debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error")},
        data: null,
        call: () => Promise.resolve(null),
        config: {port: 0},
    };
}

describe("fastify gateway lifecycle logging", () => {
    it("logs the listening address on start", async () => {
        const captured: CapturedRecord[] = [];
        const gateway = defineFastifyGateway({
            id: "web",
            server: fakeServer(),
            uses: [],
            routes: [],
        });
        const context = capturingContext(captured) as unknown as Parameters<NonNullable<typeof gateway.start>>[0];

        assert.ok(gateway.start);
        await gateway.start(context);

        const listening = captured.find((record) =>
            record.level === "info" && record.fields["event"] === "gateway.listening");
        assert.ok(listening, "expected a gateway.listening info record");
        assert.deepStrictEqual(typeof listening.fields["address"], "string");
    });

    it("logs the server close on stop", async () => {
        const captured: CapturedRecord[] = [];
        const gateway = defineFastifyGateway({
            id: "web",
            server: fakeServer(),
            uses: [],
            routes: [],
        });
        const context = capturingContext(captured) as unknown as Parameters<NonNullable<typeof gateway.stop>>[0];

        assert.ok(gateway.stop);
        await gateway.stop(context);

        const closed = captured.find((record) =>
            record.level === "info" && record.fields["event"] === "gateway.closed");
        assert.ok(closed, "expected a gateway.closed info record");
    });
});
