import {deepEqual, equal, rejects} from "node:assert/strict";
import {execFile} from "node:child_process";
import {once} from "node:events";
import {rm, symlink} from "node:fs/promises";
import {createServer} from "node:net";
import {extname} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

import {TomlError} from "smol-toml";

import type {Schema} from "../schema.ts";
import {createTemporaryDirectory} from "../test-util.ts";
import {NotRegularFileError} from "./error.ts";
import {createOptionalFileReader, createRequiredFileReader} from "./reader.ts";

const execFileAsync = promisify(execFile);
const reader_module_url = new URL(`./reader${extname(import.meta.filename)}`, import.meta.url).href;

test("document readers apply schemas and propagate parsing and validation errors", async (t) => {
    const file = (await createTemporaryDirectory(t)).join("document");
    const reader = createRequiredFileReader(file.path);
    const optional_reader = createOptionalFileReader(file.path);
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
    const json: {name: string} = await reader.json(Name);
    deepEqual(json, {name: "JSON"});
    await file.write().toml({name: "toml"});
    const toml: {name: string} | null = await optional_reader.toml(Name);
    deepEqual(toml, {name: "TOML"});

    await file.write().text("!");
    await rejects(optional_reader.json(Name), SyntaxError);
    await rejects(optional_reader.toml(Name), TomlError);

    await file.write().json(null);
    await rejects(optional_reader.json(Name), validation_error);
    await file.write().toml({unrelated: true});
    await rejects(optional_reader.toml(Name), validation_error);
    deepEqual(await reader.toml(), {unrelated: true});
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
    equal(await createRequiredFileReader(link.path).text(), "target contents");
    await rm(file.path);
    equal(await createOptionalFileReader(link.path).text(), null);
});

test("optional reads propagate denied access", async (t) => {
    const file = (await createTemporaryDirectory(t)).join("denied");
    await file.write().text("content");
    const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
    await execFileAsync(process.execPath, [
        "--permission", `--allow-fs-read=${workspace}`,
        "--input-type=module", "--eval",
        `import {rejects} from "node:assert/strict";
         const {createOptionalFileReader} = await import(process.argv[1]);
         await rejects(createOptionalFileReader(process.argv[2]).text(), {code: "ERR_ACCESS_DENIED"});`,
        reader_module_url,
        file.path,
    ]);
});

test("a FIFO without a writer is rejected promptly", {skip: process.platform === "win32"}, async (t) => {
    const fifo = (await createTemporaryDirectory(t)).join("fifo");
    await execFileAsync("mkfifo", [fifo.path]);
    await execFileAsync(process.execPath, [
        "--input-type=module", "--eval",
        `import {rejects} from "node:assert/strict";
         const {createOptionalFileReader} = await import(process.argv[1]);
         const file_path = process.argv[2];
         await rejects(createOptionalFileReader(file_path).buffer(), {name: "NotRegularFileError", file_path});`,
        reader_module_url,
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
    await rejects(createOptionalFileReader(socket.path).buffer(), NotRegularFileError);
    await rejects(createRequiredFileReader("/dev/null").buffer(), NotRegularFileError);
});
