import {deepEqual, equal} from "node:assert/strict";
import {test} from "node:test";
import {format} from "node:util";

import type {LoggerFactory} from "../index.ts";
import {consoleLoggerFactory} from "../index.ts";

test("console loggers send each level to the matching method with its scope", (t) => {
    const methods = {
        debug: t.mock.method(console, "debug", format),
        info: t.mock.method(console, "info", format),
        warn: t.mock.method(console, "warn", format),
        error: t.mock.method(console, "error", format),
    };
    const factory: LoggerFactory = consoleLoggerFactory;
    const worker = factory("worker");
    const scheduler = factory("scheduler%s");
    const payload = {jobs: 3};
    const levels = ["debug", "info", "warn", "error"] as const;
    for(const level of levels) {
        worker[level]("%s: %d jobs", level, 3, payload);
        scheduler[level]("%s ready", level, payload);
    }
    for(const level of levels) {
        const calls = methods[level].mock.calls;
        deepEqual(calls.map(({result}) => result), [
            `[worker] ${level}: 3 jobs ${format(payload)}`,
            `[scheduler%s] ${level} ready ${format(payload)}`,
        ]);
        for(const call of calls) {
            equal(call.arguments.at(-1), payload);
        }
    }
});

test("console loggers retain the console's formatting for arbitrary arguments", (t) => {
    const info = t.mock.method(console, "info", format);
    const log = consoleLoggerFactory("worker");
    const args_by_call = [
        [],
        ["literal %s and %%"],
        ["%s: %d%%", "progress", 50],
        ["%j", {jobs: 3}],
        ["", false],
        [null, ["jobs"], Symbol("job"), 3n],
        [new Error("failure"), "%s", "detail"],
    ];
    for(const args of args_by_call) {
        log.info(...args);
    }
    deepEqual(info.mock.calls.map(({result}) => result), args_by_call.map((args) =>
        args.length === 0 ? "[worker]" : `[worker] ${format(...args)}`,
    ));
});
