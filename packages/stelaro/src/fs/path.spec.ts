import assert from "node:assert/strict";
import {access, mkdir, readdir, readFile, writeFile} from "node:fs/promises";
import {dirname, isAbsolute, join, parse, resolve, sep} from "node:path";
import {describe, it} from "node:test";

import {useTempDir} from "../test-util.ts";
import {fluentPath} from "./path.ts";

// Segment lists that escape the base under a naive join.
const hostile_segments: readonly (readonly string[])[] = [
    ["..", "..", "..", "x"],
    ["a/../../../../b"],
    ["a\\..\\..\\c"],
    ["/abs/../../d"],
    ["C:rel"],
    [".. ", "e"],
    ["...", "f"],
    ["a", "..", "..", ".."],
    ["foo", "..\\..\\bar"],
    ["\\\\server\\share\\g"],
    ["\\\\?\\C:\\h"],
    ["\\\\.\\C:\\i"],
    ["C:..\\..\\j"],
    ["a/C:/../../k"],
    ["..／..／l", "..＼..＼m"],
    ["..::$INDEX_ALLOCATION"],
];

describe("@jiminp/stelaro fluent path", () => {
    const testDir = useTempDir("path");

    it("resolves the base to an absolute path", () => {
        assert.strictEqual(fluentPath("relative/dir").path, resolve("relative/dir"));
        assert.strictEqual(fluentPath("").path, process.cwd());
    });

    it("preserves an already-absolute base", () => {
        const base = resolve("/base/dir");
        assert.strictEqual(fluentPath(base).path, base);
    });

    it("joins segments onto the path", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).join("sub", "file.txt").path, join(base, "sub", "file.txt"));
    });

    it("allows join to traverse above the base", () => {
        const base = resolve("/base/nested");
        assert.strictEqual(fluentPath(base).join("..", "sibling").path, join(dirname(base), "sibling"));
    });

    it("keeps join results absolute when traversal passes the filesystem root", () => {
        const joined = fluentPath(resolve("/base")).join(...Array<string>(10).fill(".."), "x").path;
        assert.ok(isAbsolute(joined), joined);
        assert.strictEqual(joined, join(parse(resolve("/")).root, "x"));
    });

    it("returns a new FluentPath from every path operation and leaves the original unchanged", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        for(const derived of [fp.join("sub"), fp.join(), fp.confine("sub"), fp.confine()]) {
            assert.notStrictEqual(derived, fp);
        }
        assert.strictEqual(fp.path, base);
        assert.strictEqual(fp.confine().path, base);
    });

    it("performs no I/O until a terminal read or write operation runs", async () => {
        const missing = join(testDir(), "missing");
        const fp = fluentPath(missing).join("a").confine("b", "c.txt");
        fp.read();
        fp.read({optional: true});
        fp.write();
        await assert.rejects(() => access(missing), {code: "ENOENT"});
    });

    it("confines segments within the base path", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("sub", "file.txt").path, join(base, "sub", "file.txt"));
    });

    it("resolves .. within confine without escaping", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("a", "b", "..", "c").path, join(base, "a", "c"));
    });

    it("resets to base on absolute and drive-rooted segments in confine", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("a", "/etc", "passwd").path, join(base, "etc", "passwd"));
        assert.strictEqual(fp.confine("a", "\\etc").path, join(base, "etc"));
        assert.strictEqual(fp.confine("a", "C:\\etc").path, join(base, "etc"));
        assert.strictEqual(fp.confine("a", "C:/etc").path, join(base, "etc"));
        assert.strictEqual(fp.confine("a", "z:\\etc").path, join(base, "etc"));
        assert.strictEqual(fp.confine("a", "\\\\server\\share\\g").path, join(base, "server", "share", "g"));
        assert.strictEqual(fp.confine("a", "//server/share/g").path, join(base, "server", "share", "g"));
    });

    it("keeps a drive-like part after the start of a segment as a name", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("a/C:/b").path, join(base, "a", "C:", "b"));
    });

    it("returns the base when confine resolves to nothing", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("..").path, base);
        assert.strictEqual(fp.confine("a", "..").path, base);
        assert.strictEqual(fp.confine("/").path, base);
        assert.strictEqual(fp.confine("C:\\").path, base);
        assert.strictEqual(fp.confine("///", "\\\\").path, base);
    });

    it("skips . segments in confine", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine(".", "a", ".", "b").path, join(base, "a", "b"));
    });

    it("handles compound paths with slashes in confine", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("a/b/../c").path, join(base, "a", "c"));
    });

    it("confines to the path it is called on, not to an earlier base", () => {
        const base = resolve("/base");
        const confined = fluentPath(base).join("sub").confine("..", "..", "escape");
        assert.strictEqual(confined.path, join(base, "sub", "escape"));
    });

    it("confines below a filesystem root base", () => {
        const root = parse(resolve("/")).root;
        assert.strictEqual(fluentPath(root).confine("..", "..", "x").path, join(root, "x"));
    });

    it("treats backslash as a separator so traversal cannot hide", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("a\\..\\..\\b").path, join(base, "b"));
    });

    it("caps surplus and deeply nested traversal at the base", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine("..", "..", "..", "..", "secret").path, join(base, "secret"));
        assert.strictEqual(fp.confine("../../../../etc/passwd").path, join(base, "etc", "passwd"));
        assert.strictEqual(fp.confine("foo/../../../bar/./baz").path, join(base, "bar", "baz"));
        assert.strictEqual(fp.confine("../".repeat(10_000) + "deep").path, join(base, "deep"));
    });

    it("keeps a drive-relative segment as a child component, not a drive jump", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("C:rel").path, join(base, "C:rel"));
    });

    it("keeps trailing-dot and trailing-space components as literal children, not traversal", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        assert.strictEqual(fp.confine(".. ").path, join(base, ".. "));
        assert.strictEqual(fp.confine("...").path, join(base, "..."));
    });

    it("keeps non-ASCII lookalike separators inside names", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("..／x").path, join(base, "..／x"));
        assert.strictEqual(fluentPath(base).confine("..＼x").path, join(base, "..＼x"));
    });

    it("ignores empty and . noise between segments", () => {
        const base = resolve("/base");
        assert.strictEqual(fluentPath(base).confine("", ".", "", "a").path, join(base, "a"));
    });

    it("never yields a path string outside the base for hostile inputs", () => {
        const base = resolve("/base");
        const fp = fluentPath(base);
        for(const segments of hostile_segments) {
            const out = fp.confine(...segments).path;
            assert.ok(out === base || out.startsWith(base + sep), `${JSON.stringify(segments)} -> ${out} escaped ${base}`);
        }
    });

    it("never reads or writes outside the base through node:fs for hostile inputs", async () => {
        const root = testDir();
        const base = join(root, "base");
        await mkdir(base);
        await writeFile(join(root, "secret.txt"), "SECRET", "utf-8");
        const fp = fluentPath(base);

        const targets = [...hostile_segments.map((segments) => [...segments, "secret.txt"]), ["..", "secret.txt"], [join(root, "secret.txt")]];
        for(const segments of targets) {
            const confined = fp.confine(...segments);
            const content = await confined.read({optional: true}).text().catch(() => null);
            assert.notStrictEqual(content, "SECRET", `${JSON.stringify(segments)} read ${confined.path}`);
            await confined.write().text("WRITTEN").catch(() => {});
        }

        assert.deepStrictEqual((await readdir(root)).sort(), ["base", "secret.txt"]);
        assert.strictEqual(await readFile(join(root, "secret.txt"), "utf-8"), "SECRET");
    });

    it("keeps reserved Windows device names and stream suffixes as files inside the base through node:fs", async () => {
        // On Windows these stay files only through Node's `\\?\` prefixing (s0022); elsewhere they are plain names.
        const root = testDir();
        const fp = fluentPath(join(root, "base"));
        for(const name of ["NUL", "con", "COM1", "CONIN$", "nul.txt", "a:b"]) {
            const confined = fp.confine(name);
            assert.strictEqual(dirname(confined.path), join(root, "base"), name);
            await confined.write().text(`content of ${name}`);
            assert.strictEqual(await confined.read().text(), `content of ${name}`, name);
        }
        assert.deepStrictEqual(await readdir(root), ["base"]);
    });
});
