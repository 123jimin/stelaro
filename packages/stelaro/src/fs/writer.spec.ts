import assert from "node:assert/strict";
import {readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {describe, it} from "node:test";

import {parse as parseToml} from "smol-toml";

import {useTempDir} from "../test-util.ts";
import {fluentPath} from "./path.ts";

describe("@jiminp/stelaro fluent file writer", () => {
    const testDir = useTempDir("writer");

    it("writes a UTF-8 text file", async () => {
        await fluentPath(testDir()).join("output.txt").write().text("한글 ✓ 😀");
        assert.deepStrictEqual(await readFile(join(testDir(), "output.txt")), Buffer.from("한글 ✓ 😀", "utf-8"));
    });

    it("writes a Buffer file byte for byte", async () => {
        const data = Buffer.from([0x00, 0xDE, 0xAD, 0xBE, 0xEF, 0xFF]);
        await fluentPath(testDir()).join("binary.bin").write().buffer(data);
        assert.deepStrictEqual(await readFile(join(testDir(), "binary.bin")), data);
    });

    it("writes empty text and an empty Buffer as empty files", async () => {
        const fp = fluentPath(testDir());
        await fp.join("empty.txt").write().text("");
        await fp.join("empty.bin").write().buffer(Buffer.alloc(0));
        assert.strictEqual((await readFile(join(testDir(), "empty.txt"))).length, 0);
        assert.strictEqual((await readFile(join(testDir(), "empty.bin"))).length, 0);
    });

    it("writes a JSON file", async () => {
        const value = {count: 42, items: [1, "二", null], nested: {flag: true}};
        await fluentPath(testDir()).join("data.json").write().json(value);
        assert.deepStrictEqual(JSON.parse(await readFile(join(testDir(), "data.json"), "utf-8")), value);
    });

    it("writes a TOML file", async () => {
        const value = {name: "한글", count: 7, nested: {flag: true, list: [1, 2]}};
        await fluentPath(testDir()).join("config.toml").write().toml(value);
        assert.deepStrictEqual(parseToml(await readFile(join(testDir(), "config.toml"), "utf-8")), value);
    });

    it("overwrites an existing file with shorter content in every format", async () => {
        const file_path = join(testDir(), "overwrite");
        const fp = fluentPath(file_path);
        const long = "x".repeat(1000);

        await writeFile(file_path, long);
        await fp.write().text("short");
        assert.strictEqual(await readFile(file_path, "utf-8"), "short");

        await writeFile(file_path, long);
        await fp.write().buffer(Buffer.from([1]));
        assert.deepStrictEqual(await readFile(file_path), Buffer.from([1]));

        await writeFile(file_path, long);
        await fp.write().json({a: 1});
        assert.deepStrictEqual(JSON.parse(await readFile(file_path, "utf-8")), {a: 1});

        await writeFile(file_path, long);
        await fp.write().toml({a: 1});
        assert.deepStrictEqual(parseToml(await readFile(file_path, "utf-8")), {a: 1});
    });

    it("creates missing parent directories in every format", async () => {
        const fp = fluentPath(testDir());
        await fp.join("t", "deep", "file.txt").write().text("hello");
        await fp.join("b", "deep", "file.bin").write().buffer(Buffer.from([7]));
        await fp.join("j", "deep", "file.json").write().json([1]);
        await fp.join("m", "deep", "file.toml").write().toml({k: "v"});
        assert.strictEqual(await readFile(join(testDir(), "t", "deep", "file.txt"), "utf-8"), "hello");
        assert.deepStrictEqual(await readFile(join(testDir(), "b", "deep", "file.bin")), Buffer.from([7]));
        assert.deepStrictEqual(JSON.parse(await readFile(join(testDir(), "j", "deep", "file.json"), "utf-8")), [1]);
        assert.deepStrictEqual(parseToml(await readFile(join(testDir(), "m", "deep", "file.toml"), "utf-8")), {k: "v"});
    });

    it("writes into an existing parent directory", async () => {
        const fp = fluentPath(testDir());
        await fp.join("dir", "a.txt").write().text("a");
        await fp.join("dir", "b.txt").write().text("b");
        assert.strictEqual(await readFile(join(testDir(), "dir", "a.txt"), "utf-8"), "a");
        assert.strictEqual(await readFile(join(testDir(), "dir", "b.txt"), "utf-8"), "b");
    });
});
