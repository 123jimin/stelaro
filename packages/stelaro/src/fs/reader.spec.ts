import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {describe, it} from "node:test";

import {useTempDir} from "../test-util.ts";
import {fluentPath} from "./path.ts";

const failing_schema = {
    infer: null as unknown,
    assert(_value: unknown): unknown {
        throw new Error("validation failed");
    },
};

describe("@jiminp/stelaro fluent file reader", () => {
    const testDir = useTempDir("reader");

    it("reads a file as UTF-8 text", async () => {
        await writeFile(join(testDir(), "hello.txt"), "한글 ✓", "utf-8");
        const result = await fluentPath(testDir()).join("hello.txt").read().text();
        assert.strictEqual(result, "한글 ✓");
    });

    it("reads a file as a Buffer", async () => {
        const content = Buffer.from([0x01, 0x02, 0x03]);
        await writeFile(join(testDir(), "binary.bin"), content);
        const result = await fluentPath(testDir()).join("binary.bin").read().buffer();
        assert.deepStrictEqual(result, content);
    });

    it("reads and parses a JSON file", async () => {
        await writeFile(join(testDir(), "data.json"), '{"count":42}', "utf-8");
        const result = await fluentPath(testDir()).join("data.json").read().json();
        assert.deepStrictEqual(result, {count: 42});
    });

    it("reads and validates a JSON file with a schema", async () => {
        await writeFile(join(testDir(), "data.json"), '{"count":42}', "utf-8");
        const schema = {
            infer: null as unknown as {count: number},
            assert(value: unknown) {
                const obj = value as {count: unknown};
                if(typeof obj.count !== "number") throw new Error("bad schema");
                return value as {count: number};
            },
        };
        const result = await fluentPath(testDir()).join("data.json").read().json(schema);
        assert.deepStrictEqual(result, {count: 42});
    });

    it("throws on JSON schema validation failure", async () => {
        await writeFile(join(testDir(), "data.json"), '{"count":"bad"}', "utf-8");
        await assert.rejects(
            () => fluentPath(testDir()).join("data.json").read().json(failing_schema),
            {message: "validation failed"},
        );
    });

    it("reads and parses a TOML file", async () => {
        await writeFile(join(testDir(), "config.toml"), 'name = "test"\ncount = 7\n', "utf-8");
        const result = await fluentPath(testDir()).join("config.toml").read().toml();
        assert.deepStrictEqual(result, {name: "test", count: 7});
    });

    it("reads and validates a TOML file with a schema", async () => {
        await writeFile(join(testDir(), "config.toml"), 'name = "test"\n', "utf-8");
        const schema = {
            infer: null as unknown as {name: string},
            assert(value: unknown) {
                const obj = value as {name: unknown};
                if(typeof obj.name !== "string") throw new Error("bad schema");
                return value as {name: string};
            },
        };
        const result = await fluentPath(testDir()).join("config.toml").read().toml(schema);
        assert.deepStrictEqual(result, {name: "test"});
    });

    it("throws on TOML parse and schema validation failures", async () => {
        await writeFile(join(testDir(), "bad.toml"), "name = = test", "utf-8");
        await writeFile(join(testDir(), "config.toml"), 'name = "test"\n', "utf-8");
        const fp = fluentPath(testDir());
        await assert.rejects(() => fp.join("bad.toml").read().toml());
        await assert.rejects(
            () => fp.join("config.toml").read().toml(failing_schema),
            {message: "validation failed"},
        );
    });

    it("throws when reading a nonexistent file", async () => {
        await assert.rejects(
            () => fluentPath(testDir()).join("missing.txt").read().text(),
            {code: "ENOENT"},
        );
    });

    it("returns null for optional reads of a missing file", async () => {
        const reader = fluentPath(testDir()).join("missing").read().optional();
        assert.strictEqual(await reader.text(), null);
        assert.strictEqual(await reader.buffer(), null);
        assert.strictEqual(await reader.json(), null);
        assert.strictEqual(await reader.toml(), null);
        assert.strictEqual(await reader.json(failing_schema), null);
    });

    it("returns content for optional read of an existing file", async () => {
        await writeFile(join(testDir(), "exists.txt"), "present", "utf-8");
        const result = await fluentPath(testDir()).join("exists.txt").read().optional().text();
        assert.strictEqual(result, "present");
    });

    it("still throws non-missing I/O errors in optional mode", async () => {
        await mkdir(join(testDir(), "folder"));
        await assert.rejects(
            () => fluentPath(testDir()).join("folder").read().optional().text(),
            {code: "EISDIR"},
        );
    });

    it("still throws parse errors in optional mode", async () => {
        await writeFile(join(testDir(), "bad.json"), "not json{{{", "utf-8");
        await writeFile(join(testDir(), "bad.toml"), "name = = test", "utf-8");
        const fp = fluentPath(testDir());
        await assert.rejects(() => fp.join("bad.json").read().optional().json());
        await assert.rejects(() => fp.join("bad.toml").read().optional().toml());
    });

    it("still throws schema validation errors in optional mode", async () => {
        await writeFile(join(testDir(), "data.json"), '{"x":1}', "utf-8");
        await writeFile(join(testDir(), "config.toml"), "x = 1\n", "utf-8");
        const fp = fluentPath(testDir());
        await assert.rejects(
            () => fp.join("data.json").read().optional().json(failing_schema),
            {message: "validation failed"},
        );
        await assert.rejects(
            () => fp.join("config.toml").read().optional().toml(failing_schema),
            {message: "validation failed"},
        );
    });
});
