import assert from "node:assert/strict";
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve, sep} from "node:path";
import {describe, it} from "node:test";

import {createDataAccess} from "./data.ts";

describe("@jiminp/stelaro data access", () => {
    it("resolves dir to an absolute path from a relative input", () => {
        const data = createDataAccess("relative/path");
        assert.strictEqual(data.dir, resolve("relative/path"));
    });

    it("preserves an already-absolute dir", () => {
        const absolute_path = resolve("/base/data");
        const data = createDataAccess(absolute_path);
        assert.strictEqual(data.dir, absolute_path);
    });

    it("resolves subpaths relative to dir", () => {
        const base = resolve("/base/data");
        const data = createDataAccess(base);
        assert.strictEqual(
            data.resolve("templates/greeting.txt"),
            join(base, "templates/greeting.txt"),
        );
    });

    it("does not check whether the path exists on disk", () => {
        const data = createDataAccess(resolve("/nonexistent/deeply/nested/path"));
        assert.strictEqual(typeof data.dir, "string");
        assert.strictEqual(typeof data.resolve("file.txt"), "string");
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
        const root = mkdtempSync(join(tmpdir(), "data-confine-"));
        try {
            const dir = join(root, "box", "data");
            const data = createDataAccess(dir);
            await data.write("../../escape.txt").text("x");
            assert.strictEqual(existsSync(join(root, "escape.txt")), false);
            assert.strictEqual(existsSync(join(root, "box", "escape.txt")), false);
            assert.strictEqual(existsSync(join(dir, "escape.txt")), true);
        } finally {
            rmSync(root, {recursive: true, force: true});
        }
    });

    it("confines reads so traversal cannot read outside the data dir", async () => {
        const root = mkdtempSync(join(tmpdir(), "data-confine-"));
        try {
            const dir = join(root, "box", "data");
            mkdirSync(dir, {recursive: true});
            writeFileSync(join(root, "trap.txt"), "SECRET");
            const data = createDataAccess(dir);
            assert.strictEqual(await data.read("../../trap.txt").optional().text(), null);
        } finally {
            rmSync(root, {recursive: true, force: true});
        }
    });
});
