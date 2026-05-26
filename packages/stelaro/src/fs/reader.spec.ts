import assert from "node:assert/strict";
import {mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";

import {fluentPath} from "./path.ts";

let test_dir: string;

async function setupTestDir(): Promise<string> {
    const dir = join(tmpdir(), `stelaro-reader-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, {recursive: true});
    return dir;
}

describe("@jiminp/stelaro fluent file reader", () => {
    beforeEach(async () => {
        test_dir = await setupTestDir();
    });

    afterEach(async () => {
        await rm(test_dir, {recursive: true});
    });

    it("reads a file as UTF-8 text", async () => {
        await writeFile(join(test_dir, "hello.txt"), "hello world", "utf-8");
        const result = await fluentPath(test_dir).join("hello.txt").read().text();
        assert.strictEqual(result, "hello world");
    });

    it("reads a file as a Buffer", async () => {
        const content = Buffer.from([0x01, 0x02, 0x03]);
        await writeFile(join(test_dir, "binary.bin"), content);
        const result = await fluentPath(test_dir).join("binary.bin").read().buffer();
        assert.deepStrictEqual(result, content);
    });

    it("reads and parses a JSON file", async () => {
        await writeFile(join(test_dir, "data.json"), '{"count":42}', "utf-8");
        const result = await fluentPath(test_dir).join("data.json").read().json();
        assert.deepStrictEqual(result, {count: 42});
    });

    it("reads and validates a JSON file with a schema", async () => {
        await writeFile(join(test_dir, "data.json"), '{"count":42}', "utf-8");
        const schema = {
            infer: null as unknown as {count: number},
            assert(value: unknown) {
                const obj = value as {count: unknown};
                if(typeof obj.count !== "number") throw new Error("bad schema");
                return value as {count: number};
            },
        };
        const result = await fluentPath(test_dir).join("data.json").read().json(schema);
        assert.deepStrictEqual(result, {count: 42});
    });

    it("throws on JSON schema validation failure", async () => {
        await writeFile(join(test_dir, "data.json"), '{"count":"bad"}', "utf-8");
        const schema = {
            infer: null as unknown as {count: number},
            assert(_value: unknown) {
                throw new Error("validation failed");
            },
        };
        await assert.rejects(
            () => fluentPath(test_dir).join("data.json").read().json(schema),
            {message: "validation failed"},
        );
    });

    it("reads and parses a TOML file", async () => {
        await writeFile(join(test_dir, "config.toml"), 'name = "test"\ncount = 7\n', "utf-8");
        const result = await fluentPath(test_dir).join("config.toml").read().toml();
        assert.deepStrictEqual(result, {name: "test", count: 7});
    });

    it("reads and validates a TOML file with a schema", async () => {
        await writeFile(join(test_dir, "config.toml"), 'name = "test"\n', "utf-8");
        const schema = {
            infer: null as unknown as {name: string},
            assert(value: unknown) {
                const obj = value as {name: unknown};
                if(typeof obj.name !== "string") throw new Error("bad schema");
                return value as {name: string};
            },
        };
        const result = await fluentPath(test_dir).join("config.toml").read().toml(schema);
        assert.deepStrictEqual(result, {name: "test"});
    });

    it("throws when reading a nonexistent file", async () => {
        await assert.rejects(
            () => fluentPath(test_dir).join("missing.txt").read().text(),
            (error: unknown) => {
                assert.strictEqual((error as NodeJS.ErrnoException).code, "ENOENT");
                return true;
            },
        );
    });

    it("returns null for optional text read of a missing file", async () => {
        const result = await fluentPath(test_dir).join("missing.txt").read().optional().text();
        assert.strictEqual(result, null);
    });

    it("returns null for optional buffer read of a missing file", async () => {
        const result = await fluentPath(test_dir).join("missing.bin").read().optional().buffer();
        assert.strictEqual(result, null);
    });

    it("returns null for optional json read of a missing file", async () => {
        const result = await fluentPath(test_dir).join("missing.json").read().optional().json();
        assert.strictEqual(result, null);
    });

    it("returns null for optional toml read of a missing file", async () => {
        const result = await fluentPath(test_dir).join("missing.toml").read().optional().toml();
        assert.strictEqual(result, null);
    });

    it("returns content for optional read of an existing file", async () => {
        await writeFile(join(test_dir, "exists.txt"), "present", "utf-8");
        const result = await fluentPath(test_dir).join("exists.txt").read().optional().text();
        assert.strictEqual(result, "present");
    });

    it("still throws parse errors in optional mode", async () => {
        await writeFile(join(test_dir, "bad.json"), "not json{{{", "utf-8");
        await assert.rejects(
            () => fluentPath(test_dir).join("bad.json").read().optional().json(),
        );
    });

    it("still throws schema validation errors in optional mode", async () => {
        await writeFile(join(test_dir, "data.json"), '{"x":1}', "utf-8");
        const schema = {
            infer: null as unknown,
            assert(_value: unknown) {
                throw new Error("validation failed");
            },
        };
        await assert.rejects(
            () => fluentPath(test_dir).join("data.json").read().optional().json(schema),
            {message: "validation failed"},
        );
    });
});
