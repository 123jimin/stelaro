import assert from "node:assert/strict";
import {mkdir, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";

import {parse as parseToml} from "smol-toml";

import {fluentPath} from "./path.ts";

let test_dir: string;

async function setupTestDir(): Promise<string> {
    const dir = join(tmpdir(), `stelaro-writer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, {recursive: true});
    return dir;
}

describe("@jiminp/stelaro fluent file writer", () => {
    beforeEach(async () => {
        test_dir = await setupTestDir();
    });

    afterEach(async () => {
        await rm(test_dir, {recursive: true});
    });

    it("writes a UTF-8 text file", async () => {
        const fp = fluentPath(test_dir).join("output.txt");
        await fp.write().text("hello world");
        const content = await readFile(join(test_dir, "output.txt"), "utf-8");
        assert.strictEqual(content, "hello world");
    });

    it("writes a Buffer file", async () => {
        const data = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
        const fp = fluentPath(test_dir).join("binary.bin");
        await fp.write().buffer(data);
        const content = await readFile(join(test_dir, "binary.bin"));
        assert.deepStrictEqual(content, data);
    });

    it("writes a JSON file", async () => {
        const fp = fluentPath(test_dir).join("data.json");
        await fp.write().json({count: 42, items: [1, 2, 3]});
        const content = await readFile(join(test_dir, "data.json"), "utf-8");
        assert.deepStrictEqual(JSON.parse(content), {count: 42, items: [1, 2, 3]});
    });

    it("writes a TOML file", async () => {
        const fp = fluentPath(test_dir).join("config.toml");
        await fp.write().toml({name: "test", count: 7});
        const content = await readFile(join(test_dir, "config.toml"), "utf-8");
        assert.deepStrictEqual(parseToml(content), {name: "test", count: 7});
    });

    it("overwrites an existing file", async () => {
        const file_path = join(test_dir, "overwrite.txt");
        const fp = fluentPath(file_path);
        await fp.write().text("first");
        await fp.write().text("second");
        const content = await readFile(file_path, "utf-8");
        assert.strictEqual(content, "second");
    });

    it("creates parent directories when they do not exist", async () => {
        const fp = fluentPath(test_dir).join("nested", "deep", "file.txt");
        await fp.write().text("hello");
        const content = await readFile(join(test_dir, "nested", "deep", "file.txt"), "utf-8");
        assert.strictEqual(content, "hello");
    });

    it("round-trips json through read and write", async () => {
        const data = {users: [{name: "alice"}, {name: "bob"}]};
        const fp = fluentPath(test_dir).join("round.json");
        await fp.write().json(data);
        const result = await fp.read().json();
        assert.deepStrictEqual(result, data);
    });

    it("round-trips toml through read and write", async () => {
        const data = {database: {host: "localhost", port: 5432}};
        const fp = fluentPath(test_dir).join("round.toml");
        await fp.write().toml(data);
        const result = await fp.read().toml();
        assert.deepStrictEqual(result, data);
    });
});
