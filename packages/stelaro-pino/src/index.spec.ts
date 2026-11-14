import {deepEqual, equal, match, notEqual} from "node:assert/strict";
import {test} from "node:test";
import {format} from "node:util";

import {createApplication, defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import type {Logger as PinoLogger, LoggerOptions} from "pino";
import pino from "pino";

import {definePinoLogger} from "./index.ts";

function captureLogs(options: LoggerOptions = {}) {
    const records: Record<string, unknown>[] = [];
    const root = pino({base: null, timestamp: false, ...options}, {
        write(line) { records.push(JSON.parse(line) as Record<string, unknown>); },
    });
    return {root, records};
}

test("application scopes and native children inherit caller bindings, serializers, and output options", async () => {
    const {root, records} = captureLogs({
        level: "info",
        base: {service: "scheduler"},
        messageKey: "message",
        serializers: {job: (job: {id: number}) => ({id: job.id})},
    });
    const logger = definePinoLogger(root);
    const first_child: PinoLogger = logger.childPinoLogger("exporter");
    const second_child = logger.childPinoLogger("exporter");
    notEqual(first_child, second_child);
    deepEqual(first_child.bindings(), {service: "scheduler", component: "exporter"});
    deepEqual(second_child.bindings(), first_child.bindings());
    deepEqual(root.bindings(), {service: "scheduler"});

    const job = {id: 17, state: "new"};
    const component = defineComponent({
        calls: defineComponentCalls("worker", {}),
        uses: [],
        handlers: {},
        start({log}) {
            log.debug("filtered");
            log.info({job}, "Started job %d", job.id);
        },
    });
    const app = createApplication({components: [component], logger});
    await app.start();
    await app.stop();
    first_child.info({job}, "Exported job");
    deepEqual(records, [
        {level: 30, service: "scheduler", component: "worker", job: {id: 17}, message: "Started job 17"},
        {level: 30, service: "scheduler", component: "exporter", job: {id: 17}, message: "Exported job"},
    ]);
    equal(root.level, "info");
});

test("each method maps to the matching Pino level and obeys its filter", () => {
    const {root, records} = captureLogs({level: "debug"});
    const logger = definePinoLogger(root);
    const levels = ["debug", "info", "warn", "error"] as const;
    const verbose = logger("verbose");
    for(const level of levels) {
        verbose[level](level);
    }
    root.level = "warn";
    const quiet = logger("quiet");
    for(const level of levels) {
        quiet[level](level);
    }
    deepEqual(records, [
        {level: 20, component: "verbose", msg: "debug"},
        {level: 30, component: "verbose", msg: "info"},
        {level: 40, component: "verbose", msg: "warn"},
        {level: 50, component: "verbose", msg: "error"},
        {level: 40, component: "quiet", msg: "warn"},
        {level: 50, component: "quiet", msg: "error"},
    ]);
});

test("leading objects and errors use Pino's structured records", () => {
    const {root, records} = captureLogs({errorKey: "failure"});
    const log = definePinoLogger(root)("worker");
    log.info({jobs: 3});
    log.info({jobs: 3}, "%s: %d%%", "progress", 50, ["queued"]);
    const failure = new Error("connection lost");
    log.error(failure);
    log.error(failure, "Attempt %d failed", 2);

    deepEqual(records, [
        {level: 30, component: "worker", jobs: 3},
        {level: 30, component: "worker", jobs: 3, msg: format("%s: %d%%", "progress", 50, ["queued"])},
        {level: 50, component: "worker", failure: {type: "Error", message: failure.message, stack: failure.stack}, msg: failure.message},
        {level: 50, component: "worker", failure: {type: "Error", message: failure.message, stack: failure.stack}, msg: "Attempt 2 failed"},
    ]);
});

test("unstructured arguments use Node's console formatting", () => {
    const {root, records} = captureLogs();
    const log = definePinoLogger(root)("worker%s");
    const args_by_call = [
        [],
        ["literal %s and %%"],
        ["%s: %d%%", "progress", 50],
        ["%j", {jobs: 3}],
        ["", false],
        [null, ["jobs"], Symbol("job"), 3n],
        [["jobs", 3], {ready: true}],
        ["failed", new Error("connection lost")],
        [3, "jobs", false],
    ];
    for(const args of args_by_call) {
        log.info(...args);
    }
    equal(records.length, args_by_call.length);
    deepEqual(records.map((record) => record["msg"]), args_by_call.map((args) => format(...args)));
    match(String(records.at(-2)?.["msg"]), /Error: connection lost/);
});
