import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {describe, it} from "node:test";

import {fluentPath} from "../fs/path.ts";
import {useTempDir} from "../test-util.ts";
import {createDataAccess} from "./data.ts";

const hostile_subpath = "a/../../..\\../etc/passwd";

describe("@jiminp/stelaro data access", () => {
    const testDir = useTempDir("data");

    it("exposes dir as an absolute path", () => {
        assert.strictEqual(createDataAccess("relative/data").dir, resolve("relative/data"));
        const absolute = resolve("/base/data");
        assert.strictEqual(createDataAccess(absolute).dir, absolute);
    });

    it("resolves subpaths with confine on dir", () => {
        const dir = resolve("/base/data");
        assert.strictEqual(createDataAccess(dir).resolve(hostile_subpath), fluentPath(dir).confine(hostile_subpath).path);
    });

    it("neither checks nor creates directories when resolving or creating readers and writers", async () => {
        const data = createDataAccess(join(testDir(), "missing", "data"));
        data.resolve("a/b.txt");
        data.read("a/b.txt");
        data.write("a/b.txt");
        assert.deepStrictEqual(await readdir(testDir()), []);
    });

    it("reads and writes the file at the confined path", async () => {
        const dir = join(testDir(), "box", "data");
        const data = createDataAccess(dir);
        await data.write(hostile_subpath).text("x");
        assert.strictEqual(await readFile(fluentPath(dir).confine(hostile_subpath).path, "utf-8"), "x");
        assert.strictEqual(await data.read(hostile_subpath).text(), "x");
        assert.deepStrictEqual(await readdir(testDir()), ["box"]);
        assert.deepStrictEqual(await readdir(join(testDir(), "box")), ["data"]);
    });
});
