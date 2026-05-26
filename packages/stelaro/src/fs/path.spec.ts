import assert from "node:assert/strict";
import {join, resolve} from "node:path";
import {describe, it} from "node:test";

import {fluentPath} from "./path.ts";

describe("@jiminp/stelaro fluent path", () => {
    it("resolves the base to an absolute path", () => {
        const fp = fluentPath("relative/dir");
        assert.strictEqual(fp.path, resolve("relative/dir"));
    });

    it("preserves an already-absolute base", () => {
        const base = resolve("/base/dir");
        const fp = fluentPath(base);
        assert.strictEqual(fp.path, base);
    });

    it("joins segments onto the path", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.join("sub", "file.txt").path, join(base, "sub", "file.txt"));
    });

    it("allows join to traverse above the base", () => {
        const base = resolve("/base/nested");
        const fp = fluentPath(base);
        assert.strictEqual(fp.join("..", "sibling").path, join(base, "..", "sibling"));
    });

    it("returns a new FluentPath from join", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        const joined = fp.join("sub");
        assert.notStrictEqual(fp, joined);
        assert.strictEqual(fp.path, base);
    });

    it("confines segments within the base path", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("sub", "file.txt").path, join(base, "sub", "file.txt"));
    });

    it("clamps .. at the base in confine", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("..", "..", "etc").path, join(base, "etc"));
    });

    it("resolves .. within confine without escaping", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("a", "b", "..", "c").path, join(base, "a", "c"));
    });

    it("resets to base on absolute segments in confine", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("a", "/etc", "passwd").path, join(base, "etc", "passwd"));
    });

    it("returns the base when confine resolves to nothing", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("..").path, base);
        assert.strictEqual(fp.confine("a", "..").path, base);
    });

    it("skips . segments in confine", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine(".", "a", ".", "b").path, join(base, "a", "b"));
    });

    it("handles compound paths with slashes in confine", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("a/b/../c").path, join(base, "a", "c"));
    });

    it("chains join and confine independently", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        const sub = fp.join("sub");
        const confined = sub.confine("..", "..", "escape");
        assert.strictEqual(confined.path, join(base, "sub", "escape"));
    });
});
