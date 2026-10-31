import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {chmod, mkdir, symlink, writeFile} from "node:fs/promises";
import {createServer, type Server} from "node:net";
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

// Returns a value distinct from its input, so a reader that ignores `assert`'s result fails.
const wrapping_schema = {
    infer: null as unknown as {readonly validated: unknown},
    assert(value: unknown): {readonly validated: unknown} {
        return {validated: value};
    },
};

async function listen(server: Server, path: string): Promise<void> {
    const listening = Promise.withResolvers<void>();
    server.listen(path, listening.resolve);
    await listening.promise;
}

describe("@jiminp/stelaro fluent file reader", () => {
    const testDir = useTempDir("reader");

    it("reads a file as UTF-8 text", async () => {
        await writeFile(join(testDir(), "hello.txt"), "한글 ✓ 😀", "utf-8");
        assert.strictEqual(await fluentPath(testDir()).join("hello.txt").read().text(), "한글 ✓ 😀");
    });

    it("reads a file as a Buffer", async () => {
        const content = Buffer.from([0x00, 0xFF, 0xC3, 0x28, 0x0A]);
        await writeFile(join(testDir(), "binary.bin"), content);
        assert.deepStrictEqual(await fluentPath(testDir()).join("binary.bin").read().buffer(), content);
    });

    it("reads an empty file as empty text and an empty Buffer", async () => {
        await writeFile(join(testDir(), "empty"), "");
        const reader = fluentPath(testDir()).join("empty").read();
        assert.strictEqual(await reader.text(), "");
        assert.deepStrictEqual(await reader.buffer(), Buffer.alloc(0));
    });

    it("reads and parses a JSON file", async () => {
        await writeFile(join(testDir(), "data.json"), '{"count":42,"items":[1,"二"]}', "utf-8");
        assert.deepStrictEqual(await fluentPath(testDir()).join("data.json").read().json(), {count: 42, items: [1, "二"]});
    });

    it("reads and parses a TOML file", async () => {
        await writeFile(join(testDir(), "config.toml"), 'name = "test"\ncount = 7\n[nested]\nflag = true\n', "utf-8");
        assert.deepStrictEqual(
            await fluentPath(testDir()).join("config.toml").read().toml(),
            {name: "test", count: 7, nested: {flag: true}},
        );
    });

    it("returns what the schema's assert returns for the parsed JSON and TOML", async () => {
        await writeFile(join(testDir(), "data.json"), '{"count":42}', "utf-8");
        await writeFile(join(testDir(), "config.toml"), 'name = "test"\n', "utf-8");
        const fp = fluentPath(testDir());
        assert.deepStrictEqual(await fp.join("data.json").read().json(wrapping_schema), {validated: {count: 42}});
        assert.deepStrictEqual(await fp.join("config.toml").read().toml(wrapping_schema), {validated: {name: "test"}});
    });

    it("throws on JSON and TOML parse failures and on schema validation failures", async () => {
        await writeFile(join(testDir(), "bad.json"), "not json{{{", "utf-8");
        await writeFile(join(testDir(), "bad.toml"), "name = = test", "utf-8");
        await writeFile(join(testDir(), "data.json"), '{"count":"bad"}', "utf-8");
        await writeFile(join(testDir(), "config.toml"), 'name = "test"\n', "utf-8");
        const fp = fluentPath(testDir());
        await assert.rejects(() => fp.join("bad.json").read().json(), SyntaxError);
        await assert.rejects(() => fp.join("bad.toml").read().toml());
        await assert.rejects(() => fp.join("data.json").read().json(failing_schema), {message: "validation failed"});
        await assert.rejects(() => fp.join("config.toml").read().toml(failing_schema), {message: "validation failed"});
    });

    it("throws when reading a nonexistent file", async () => {
        const reader = fluentPath(testDir()).join("missing.txt").read();
        for(const read of [() => reader.text(), () => reader.buffer(), () => reader.json(), () => reader.toml()]) {
            await assert.rejects(read, {code: "ENOENT"});
        }
    });

    it("returns null for optional reads where no file can exist", async () => {
        await writeFile(join(testDir(), "plain.txt"), "x", "utf-8");
        const fp = fluentPath(testDir());
        const files = [fp.join("missing"), fp.join("missing-dir", "file"), fp.join("plain.txt", "child"), fp.join("x".repeat(5000))];
        for(const file of files) {
            const reader = file.read().optional();
            assert.strictEqual(await reader.text(), null, file.path);
            assert.strictEqual(await reader.buffer(), null, file.path);
            assert.strictEqual(await reader.json(), null, file.path);
            assert.strictEqual(await reader.toml(), null, file.path);
            assert.strictEqual(await reader.json(failing_schema), null, file.path);
            assert.strictEqual(await reader.toml(failing_schema), null, file.path);
        }
    });

    it("selects the optional reader with read({optional: true}) only", async () => {
        await writeFile(join(testDir(), "exists.txt"), "present", "utf-8");
        const fp = fluentPath(testDir());
        assert.strictEqual(await fp.join("missing").read({optional: true}).text(), null);
        assert.strictEqual(await fp.join("exists.txt").read({optional: true}).text(), "present");
        await assert.rejects(() => fp.join("missing").read({optional: false}).text(), {code: "ENOENT"});
        await assert.rejects(() => fp.join("missing").read({}).text(), {code: "ENOENT"});
    });

    it("returns the content and validated values for optional reads of existing files", async () => {
        await writeFile(join(testDir(), "exists.txt"), "present", "utf-8");
        await writeFile(join(testDir(), "data.json"), '{"x":1}', "utf-8");
        await writeFile(join(testDir(), "config.toml"), "x = 1\n", "utf-8");
        const fp = fluentPath(testDir());
        assert.strictEqual(await fp.join("exists.txt").read().optional().text(), "present");
        assert.deepStrictEqual(await fp.join("exists.txt").read().optional().buffer(), Buffer.from("present"));
        assert.deepStrictEqual(await fp.join("data.json").read().optional().json(), {x: 1});
        assert.deepStrictEqual(await fp.join("config.toml").read().optional().toml(), {x: 1});
        assert.deepStrictEqual(await fp.join("data.json").read().optional().json(wrapping_schema), {validated: {x: 1}});
        assert.deepStrictEqual(await fp.join("config.toml").read().optional().toml(wrapping_schema), {validated: {x: 1}});
    });

    it("treats an empty existing file as present in optional mode", async () => {
        await writeFile(join(testDir(), "empty"), "");
        const reader = fluentPath(testDir()).join("empty").read().optional();
        assert.strictEqual(await reader.text(), "");
        assert.deepStrictEqual(await reader.buffer(), Buffer.alloc(0));
        assert.deepStrictEqual(await reader.toml(), {});
        await assert.rejects(() => reader.json(), SyntaxError);
    });

    it("rejects a directory, even in optional mode", async () => {
        await mkdir(join(testDir(), "folder"));
        const reader = fluentPath(testDir()).join("folder").read();
        for(const read of [() => reader.text(), () => reader.buffer(), () => reader.json(), () => reader.toml()]) {
            await assert.rejects(read, NotRegularFileError);
        }
        const optional = reader.optional();
        for(const read of [() => optional.text(), () => optional.buffer(), () => optional.json(), () => optional.toml()]) {
            await assert.rejects(read, NotRegularFileError);
        }
    });

    it("reports the read path on NotRegularFileError", async () => {
        await mkdir(join(testDir(), "folder"));
        const folder = fluentPath(testDir()).join("folder");
        await assert.rejects(() => folder.read().buffer(), {file_path: folder.path});
    });

    it("rejects a symlink to a directory, even in optional mode", async () => {
        await mkdir(join(testDir(), "folder"));
        // `junction` needs no privilege on Windows; other platforms ignore the type.
        await symlink(join(testDir(), "folder"), join(testDir(), "link"), "junction");
        const link = fluentPath(testDir()).join("link");
        await assert.rejects(() => link.read().buffer(), NotRegularFileError);
        await assert.rejects(() => link.read().optional().buffer(), NotRegularFileError);
    });

    it("follows a symlink to a regular file", async (t) => {
        await writeFile(join(testDir(), "target.txt"), "linked", "utf-8");
        try {
            await symlink(join(testDir(), "target.txt"), join(testDir(), "link.txt"));
        } catch (error) {
            if((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
            t.skip("creating file symlinks needs a privilege this process lacks");
            return;
        }
        const link = fluentPath(testDir()).join("link.txt");
        assert.strictEqual(await link.read().text(), "linked");
        assert.strictEqual(await link.read().optional().text(), "linked");
    });

    it("rejects a FIFO, a socket, or a device, even through a symlink, without waiting on the FIFO", {skip: process.platform === "win32", timeout: 5_000}, async () => {
        await symlink("/dev/null", join(testDir(), "null.txt"));
        await promisify(execFile)("mkfifo", [join(testDir(), "pipe")]);
        await symlink(join(testDir(), "pipe"), join(testDir(), "pipe-link"));
        const socket_server = createServer();
        await listen(socket_server, join(testDir(), "sock"));
        try {
            const fp = fluentPath(testDir());
            for(const name of ["null.txt", "pipe", "pipe-link", "sock"]) {
                await assert.rejects(() => fp.join(name).read().buffer(), NotRegularFileError, name);
                await assert.rejects(() => fp.join(name).read().optional().buffer(), NotRegularFileError, name);
            }
            await assert.rejects(() => fluentPath("/dev/null").read().text(), NotRegularFileError);
        } finally {
            socket_server.close();
        }
    });

    it("rejects a named pipe, even in optional mode", {skip: process.platform !== "win32", timeout: 5_000}, async () => {
        const pipe_path = `\\\\.\\pipe\\stelaro-reader-${process.pid}`;
        const pipe_server = createServer((socket) => socket.end());
        await listen(pipe_server, pipe_path);
        try {
            await assert.rejects(() => fluentPath(pipe_path).read().buffer(), NotRegularFileError);
            await assert.rejects(() => fluentPath(pipe_path).read().optional().buffer(), NotRegularFileError);
        } finally {
            pipe_server.close();
        }
    });

    it("propagates permission errors in optional mode", {skip: process.platform === "win32" || process.getuid?.() === 0}, async () => {
        const file_path = join(testDir(), "locked.txt");
        await writeFile(file_path, "secret", "utf-8");
        await chmod(file_path, 0o000);
        try {
            await assert.rejects(() => fluentPath(file_path).read().optional().text(), {code: "EACCES"});
            await assert.rejects(() => fluentPath(file_path).read().text(), {code: "EACCES"});
        } finally {
            await chmod(file_path, 0o600);
        }
    });

    it("still throws parse errors in optional mode", async () => {
        await writeFile(join(testDir(), "bad.json"), "not json{{{", "utf-8");
        await writeFile(join(testDir(), "bad.toml"), "name = = test", "utf-8");
        const fp = fluentPath(testDir());
        await assert.rejects(() => fp.join("bad.json").read().optional().json(), SyntaxError);
        await assert.rejects(() => fp.join("bad.toml").read().optional().toml());
    });

    it("still throws schema validation errors in optional mode", async () => {
        await writeFile(join(testDir(), "data.json"), '{"x":1}', "utf-8");
        await writeFile(join(testDir(), "config.toml"), "x = 1\n", "utf-8");
        const fp = fluentPath(testDir());
        await assert.rejects(() => fp.join("data.json").read().optional().json(failing_schema), {message: "validation failed"});
        await assert.rejects(() => fp.join("config.toml").read().optional().toml(failing_schema), {message: "validation failed"});
    });
});
