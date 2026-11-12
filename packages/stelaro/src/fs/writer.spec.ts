import {deepEqual, equal, ok, rejects} from "node:assert/strict";
import {Buffer} from "node:buffer";
import {test} from "node:test";

import {createTemporaryDirectory} from "../test-util.ts";
import {createFileWriter} from "./writer.ts";

test("writers create parents and overwrite files in all four formats", async (t) => {
    const file = (await createTemporaryDirectory(t)).confine("nested", "file");
    const writer = createFileWriter(file.path);
    const reader = file.read();

    await writer.text("héllo");
    equal(await reader.text(), "héllo");
    await writer.text("é");
    equal(await reader.text(), "é");

    const bytes = Buffer.from([0, 255, 1]);
    await writer.buffer(bytes);
    deepEqual(await reader.buffer(), bytes);
    await writer.buffer(Buffer.alloc(0));
    deepEqual(await reader.buffer(), Buffer.alloc(0));

    await writer.json({discarded: true, padding: [1, 2, 3]});
    await writer.json({name: "json"});
    deepEqual(await reader.json(), {name: "json"});

    await writer.toml({discarded: true, padding: [1, 2, 3]});
    const toml = {name: "toml", items: [{nested: {enabled: true}}]};
    await writer.toml(toml);
    await rejects(writer.json(Symbol("unserializable")), TypeError);
    deepEqual(await reader.toml(), toml);
});

test("overlapping writes leave one complete document", async (t) => {
    const file = (await createTemporaryDirectory(t)).join("document.json");
    // Different lengths expose mixed writes and stale suffixes.
    const first = {payload: "a".repeat(2 * 1024 * 1024)};
    const second = {payload: "b".repeat(768 * 1024)};

    await file.write().json({payload: "previous"});
    await Promise.all([file.write().json(first), file.write().json(second)]);

    const content = await file.read().text();
    ok(content === JSON.stringify(first) || content === JSON.stringify(second),
        "Expected one complete JSON document after both writes finished");
});
