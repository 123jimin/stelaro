import {deepEqual, equal, rejects} from "node:assert/strict";
import {appendFile} from "node:fs/promises";
import {test} from "node:test";

import {createDataAccess} from "@jiminp/stelaro";
import {TraversalError, type} from "arktype";

import {appendJsonlRecord, createWriteQueue, readJsonlRecords} from "./storage.ts";
import {createTemporaryDirectory, readRawJsonlLines} from "./test-util.ts";

const SampleRecord = type({"+": "reject", "id": "string > 0", "value": "number"});

test("readJsonlRecords returns empty for missing files and reads uncached updates", async (t) => {
    const data = createDataAccess(await createTemporaryDirectory(t));
    deepEqual(await readJsonlRecords(data, "sample.jsonl", SampleRecord), []);

    await appendJsonlRecord(data, "sample.jsonl", SampleRecord, {id: "first", value: 1});
    const first_lines = await readRawJsonlLines(data.resolve("sample.jsonl"));
    equal(first_lines.length, 1);

    await appendJsonlRecord(data, "sample.jsonl", SampleRecord, {id: "second", value: 2});
    const second_lines = await readRawJsonlLines(data.resolve("sample.jsonl"));
    equal(second_lines.length, 2);
    equal(second_lines[0], first_lines[0]);

    // External append is immediately visible without reloading or clearing state.
    await appendFile(data.resolve("sample.jsonl"), `${JSON.stringify({id: "third", value: 3})}\n`, "utf8");
    deepEqual(await readJsonlRecords(data, "sample.jsonl", SampleRecord), [
        {id: "first", value: 1},
        {id: "second", value: 2},
        {id: "third", value: 3},
    ]);
});

test("JSONL helpers reject extra fields on write and malformed persisted lines on read", async (t) => {
    const data = createDataAccess(await createTemporaryDirectory(t));
    await rejects(
        () => appendJsonlRecord(data, "sample.jsonl", SampleRecord, {id: "bad", value: 1, extra: true} as never),
        TraversalError,
    );
    await appendFile(data.resolve("sample.jsonl"), `${JSON.stringify({id: "bad", value: "wrong"})}\n`, "utf8");
    await rejects(() => readJsonlRecords(data, "sample.jsonl", SampleRecord), TraversalError);
});

test("createWriteQueue serializes operations and continues after a rejection", async () => {
    const enqueue = createWriteQueue();
    const order: string[] = [];

    const first = enqueue(async () => {
        order.push("start-1");
        await Promise.resolve();
        order.push("end-1");
        return 1;
    });
    const failing = enqueue(() => {
        order.push("fail-2");
        return Promise.reject(new Error("boom"));
    });
    const third = enqueue(() => {
        order.push("run-3");
        return Promise.resolve(3);
    });

    equal(await first, 1);
    await rejects(() => failing, /boom/u);
    equal(await third, 3);
    deepEqual(order, ["start-1", "end-1", "fail-2", "run-3"]);
});
