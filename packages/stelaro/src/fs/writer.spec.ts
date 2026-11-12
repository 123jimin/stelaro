import {deepEqual, equal, rejects} from "node:assert/strict";
import {Buffer} from "node:buffer";
import {test} from "node:test";

import {createTemporaryDirectory} from "../test-util.js";

test("writers create parents and overwrite files in all four formats", async (t) => {
    const file = (await createTemporaryDirectory(t)).confine("nested", "file");
    const writer = file.write();
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
