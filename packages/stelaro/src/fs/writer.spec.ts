import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import {join} from "node:path";
import {describe, it} from "node:test";

import {parse as parseToml} from "smol-toml";

import {useTempDir} from "../test-util.ts";
import {fluentPath} from "./path.ts";

describe("@jiminp/stelaro fluent file writer", () => {
    const testDir = useTempDir("writer");

    it("writes a UTF-8 text file", async () => {
        const fp = fluentPath(testDir()).join("output.txt");
        await fp.write().text("한글 ✓");
        const content = await readFile(join(testDir(), "output.txt"), "utf-8");
        assert.strictEqual(content, "한글 ✓");
    });

    it("writes a Buffer file", async () => {
        const data = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
        const fp = fluentPath(testDir()).join("binary.bin");
        await fp.write().buffer(data);
        const content = await readFile(join(testDir(), "binary.bin"));
        assert.deepStrictEqual(content, data);
    });

    it("writes a JSON file", async () => {
        const fp = fluentPath(testDir()).join("data.json");
        await fp.write().json({count: 42, items: [1, 2, 3]});
        const content = await readFile(join(testDir(), "data.json"), "utf-8");
        assert.deepStrictEqual(JSON.parse(content), {count: 42, items: [1, 2, 3]});
    });

    it("rejects a JSON value without a JSON representation before creating directories", async () => {
        const fp = fluentPath(testDir()).join("nested", "data.json");
        await assert.rejects(() => fp.write().json(Symbol("unserializable")), TypeError);
        await assert.rejects(() => access(join(testDir(), "nested")), {code: "ENOENT"});
    });

    it("writes a TOML file", async () => {
        const fp = fluentPath(testDir()).join("config.toml");
        await fp.write().toml({name: "test", count: 7});
        const content = await readFile(join(testDir(), "config.toml"), "utf-8");
        assert.deepStrictEqual(parseToml(content), {name: "test", count: 7});
    });

    it("overwrites an existing file with shorter content", async () => {
        const file_path = join(testDir(), "overwrite.txt");
        const fp = fluentPath(file_path);
        await fp.write().text("a much longer first value");
        await fp.write().text("short");
        const content = await readFile(file_path, "utf-8");
        assert.strictEqual(content, "short");
    });

    it("creates parent directories when they do not exist", async () => {
        const fp = fluentPath(testDir()).join("nested", "deep", "file.txt");
        await fp.write().text("hello");
        const content = await readFile(join(testDir(), "nested", "deep", "file.txt"), "utf-8");
        assert.strictEqual(content, "hello");
    });
});
