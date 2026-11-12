import {deepEqual, equal, rejects} from "node:assert/strict";
import {execFile} from "node:child_process";
import {once} from "node:events";
import {rm, symlink} from "node:fs/promises";
import {createServer} from "node:net";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

import {TomlError} from "smol-toml";

import type {Schema} from "../index.js";
import {createFluentPath, NotRegularFileError} from "../index.js";
import {createTemporaryDirectory} from "../test-util.js";

const execFileAsync = promisify(execFile);

test("document readers apply schemas and propagate parsing and validation errors", async (t) => {
    const file = (await createTemporaryDirectory(t)).join("document");
    const validation_error = new Error("Expected a name");
    const Name = {
        infer: {name: ""},
        assert(input: unknown) {
            if(input == null || typeof input !== "object" || !("name" in input) || typeof input.name !== "string") {
                throw validation_error;
            }
            return {name: input.name.toUpperCase()};
        },
    } satisfies Schema;

    await file.write().json({name: "json"});
    const json: {name: string} = await file.read().json(Name);
    deepEqual(json, {name: "JSON"});
    await file.write().toml({name: "toml"});
    const toml: {name: string} | null = await file.read({optional: true}).toml(Name);
    deepEqual(toml, {name: "TOML"});

    await file.write().text("!");
    await rejects(file.read().optional().json(Name), SyntaxError);
    await rejects(file.read({optional: true}).toml(Name), TomlError);

    await file.write().json(null);
    await rejects(file.read().optional().json(Name), validation_error);
    await file.write().toml({unrelated: true});
    await rejects(file.read({optional: true}).toml(Name), validation_error);
    deepEqual(await file.read().toml(), {unrelated: true});
});

test("optional readers return null for missing paths through both entry points", async (t) => {
    const base = await createTemporaryDirectory(t);
    const missing = base.join("missing");
    const Never = {
        infer: null,
        assert() {
            throw new Error("A missing file must not invoke its schema");
        },
    } satisfies Schema;
    await rejects(missing.read({optional: false}).text(), {code: "ENOENT"});
    equal(await missing.read().optional().text(), null);
    equal(await missing.read({optional: true}).buffer(), null);
    equal(await missing.read().optional().json(Never), null);
    equal(await missing.read({optional: true}).toml(Never), null);

    await missing.write().text("regular file");
    const invalid_paths = [missing.join("child"), base.join("x".repeat(300))];
    for(const path of invalid_paths) {
        await rejects(path.read().buffer(), {code: /^(ENOENT|ENOTDIR|ENAMETOOLONG)$/});
        equal(await path.read().optional().buffer(), null);
    }
});

test("readers follow symlinks to their target", async (t) => {
    const base = await createTemporaryDirectory(t);
    const file = base.join("target");
    const link = base.join("link");
    await file.write().text("target contents");
    try {
        await symlink(file.path, link.path, "file");
    } catch (error) {
        if(process.platform === "win32" && error instanceof Error && "code" in error && error.code === "EPERM") {
            t.skip("Creating a file symlink requires Windows developer mode or elevated privileges");
            return;
        }
        throw error;
    }
    equal(await link.read().text(), "target contents");
    await rm(file.path);
    equal(await link.read({optional: true}).text(), null);
});

test("optional reads propagate denied access", async (t) => {
    const file = (await createTemporaryDirectory(t)).join("denied");
    await file.write().text("content");
    const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
    await execFileAsync(process.execPath, [
        "--permission", `--allow-fs-read=${workspace}`,
        "--input-type=module", "--eval",
        `import {rejects} from "node:assert/strict";
         const {createFluentPath} = await import(process.argv[1]);
         await rejects(createFluentPath(process.argv[2]).read().optional().text(), {code: "ERR_ACCESS_DENIED"});`,
        new URL("../index.js", import.meta.url).href,
        file.path,
    ]);
});

test("a FIFO without a writer is rejected promptly", {skip: process.platform === "win32"}, async (t) => {
    const fifo = (await createTemporaryDirectory(t)).join("fifo");
    await execFileAsync("mkfifo", [fifo.path]);
    await execFileAsync(process.execPath, [
        "--input-type=module", "--eval",
        `import {rejects} from "node:assert/strict";
         const {createFluentPath, NotRegularFileError} = await import(process.argv[1]);
         await rejects(createFluentPath(process.argv[2]).read().optional().buffer(), NotRegularFileError);`,
        new URL("../index.js", import.meta.url).href,
        fifo.path,
    ], {timeout: 5_000});
});

test("readers reject Unix sockets and character devices", {skip: process.platform === "win32"}, async (t) => {
    const socket = (await createTemporaryDirectory(t)).join("socket");
    const server = createServer().listen(socket.path);
    t.after(() => new Promise<void>((resolve, reject) => {
        server.close((error) => error == null ? resolve() : reject(error));
    }));
    await once(server, "listening");
    await rejects(socket.read().optional().buffer(), NotRegularFileError);
    await rejects(createFluentPath("/dev/null").read().buffer(), NotRegularFileError);
});
