import assert from "node:assert/strict";
import {join, resolve} from "node:path";
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
});
