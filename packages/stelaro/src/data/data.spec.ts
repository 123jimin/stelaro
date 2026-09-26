import assert from "node:assert/strict";
import {access, mkdir} from "node:fs/promises";
import {join, resolve, sep} from "node:path";
import {describe, it} from "node:test";

import {useTempDir, writeTestFile} from "../test-util.ts";
import {createDataAccess} from "./data.ts";

function exists(file_path: string): Promise<boolean> {
    return access(file_path).then(() => true, () => false);
}

describe("@jiminp/stelaro data access", () => {
    const testDir = useTempDir("data");

    it("resolves subpaths relative to dir", () => {
        const base = resolve("/base/data");
        const data = createDataAccess(base);
        assert.strictEqual(
            data.resolve("templates/greeting.txt"),
            join(base, "templates/greeting.txt"),
        );
    });

    it("confines resolve so .. cannot escape the data dir", () => {
        const dir = resolve("/base/data");
        const data = createDataAccess(dir);
        assert.strictEqual(data.resolve("../../etc/passwd"), join(dir, "etc", "passwd"));
        assert.strictEqual(data.resolve("a/../../b"), join(dir, "b"));
        assert.strictEqual(data.resolve("/abs/secret"), join(dir, "abs", "secret"));
        for(const subpath of ["../../x", "a\\..\\..\\y", "../../../../z"]) {
            const out = data.resolve(subpath);
            assert.ok(out === dir || out.startsWith(dir + sep), `${subpath} -> ${out} escaped ${dir}`);
        }
    });

    it("confines writes to the data dir", async () => {
        const root = testDir();
        const dir = join(root, "box", "data");
        const data = createDataAccess(dir);
        await data.write("../../escape.txt").text("x");
        assert.strictEqual(await exists(join(root, "escape.txt")), false);
        assert.strictEqual(await exists(join(root, "box", "escape.txt")), false);
        assert.strictEqual(await exists(join(dir, "escape.txt")), true);
    });

    it("confines reads so traversal cannot read outside the data dir", async () => {
        const root = testDir();
        const dir = join(root, "box", "data");
        await mkdir(dir, {recursive: true});
        await writeTestFile(join(root, "trap.txt"), "SECRET");
        const data = createDataAccess(dir);
        assert.strictEqual(await data.read("../../trap.txt").optional().text(), null);
    });
});
