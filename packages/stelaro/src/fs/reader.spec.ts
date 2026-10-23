import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir, symlink, writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {join} from "node:path";
import {describe, it} from "node:test";
import {promisify} from "node:util";

import {useTempDir} from "../test-util.ts";
import {NotRegularFileError} from "./error.ts";
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

    it("returns null for optional reads where no file can exist", async () => {
        await writeFile(join(testDir(), "plain.txt"), "x", "utf-8");
        const fp = fluentPath(testDir());
        for(const file of [fp.join("missing"), fp.join("plain.txt", "child"), fp.join("x".repeat(5000))]) {
            const reader = file.read().optional();
            assert.strictEqual(await reader.text(), null, file.path);
            assert.strictEqual(await reader.buffer(), null, file.path);
            assert.strictEqual(await reader.json(), null, file.path);
            assert.strictEqual(await reader.toml(), null, file.path);
            assert.strictEqual(await reader.json(failing_schema), null, file.path);
        }
    });

    it("selects the optional reader with read({optional: true})", async () => {
        await writeFile(join(testDir(), "exists.txt"), "present", "utf-8");
        const fp = fluentPath(testDir());
        assert.strictEqual(await fp.join("missing").read({optional: true}).text(), null);
        assert.strictEqual(await fp.join("exists.txt").read({optional: true}).text(), "present");
        await assert.rejects(() => fp.join("missing").read({optional: false}).text(), {code: "ENOENT"});
    });

    it("returns content for optional read of an existing file", async () => {
        await writeFile(join(testDir(), "exists.txt"), "present", "utf-8");
        const result = await fluentPath(testDir()).join("exists.txt").read().optional().text();
        assert.strictEqual(result, "present");
    });

    it("rejects a directory, even in optional mode", async () => {
        await mkdir(join(testDir(), "folder"));
        const folder = fluentPath(testDir()).join("folder");
        await assert.rejects(() => folder.read().buffer(), NotRegularFileError);
        await assert.rejects(() => folder.read().optional().buffer(), NotRegularFileError);
    });

    it("rejects a FIFO, a socket, or a device, even through a symlink, but follows a symlink to a file", {skip: process.platform === "win32"}, async () => {
        await writeFile(join(testDir(), "target.txt"), "linked", "utf-8");
        await symlink(join(testDir(), "target.txt"), join(testDir(), "link.txt"));
        await symlink("/dev/null", join(testDir(), "null.txt"));
        await promisify(execFile)("mkfifo", [join(testDir(), "pipe")]);
        const socket_server = createServer();
        const listening = Promise.withResolvers<void>();
        socket_server.listen(join(testDir(), "sock"), listening.resolve);
        await listening.promise;
        try {
            const fp = fluentPath(testDir());
            assert.strictEqual(await fp.join("link.txt").read().text(), "linked");
            for(const name of ["null.txt", "pipe", "sock"]) {
                await assert.rejects(() => fp.join(name).read().buffer(), NotRegularFileError, name);
                await assert.rejects(() => fp.join(name).read().optional().buffer(), NotRegularFileError, name);
            }
        } finally {
            socket_server.close();
        }
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
