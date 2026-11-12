import {deepEqual, equal, rejects} from "node:assert/strict";
import {execFile} from "node:child_process";
import {stat} from "node:fs/promises";
import {extname, join, resolve} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

import {createDataAccess} from "../index.ts";
import {createTemporaryDirectory} from "../test-util.ts";

test("data access resolves absolute paths confined to its directory", () => {
    const data = createDataAccess("./data/../component-data");
    const dir = resolve("component-data");
    equal(data.dir, dir);
    equal(data.resolve("../.."), dir);
    equal(data.resolve("../../nested\\other/../file"), join(dir, "nested", "file"));
    equal(data.resolve("/rooted/file"), join(dir, "rooted", "file"));
    equal(data.resolve("Z:\\rooted/file"), join(dir, "rooted", "file"));
});

test("creating a data accessor and resolving a path require no filesystem access", async (t) => {
    const dir = (await createTemporaryDirectory(t)).join("missing");
    const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
    const index_url = new URL(`../index${extname(import.meta.filename)}`, import.meta.url).href;
    await promisify(execFile)(process.execPath, [
        "--permission", `--allow-fs-read=${workspace}`, "--input-type=module", "--eval",
        `import {equal} from "node:assert/strict";
         import {join} from "node:path";
         const {createDataAccess} = await import(process.argv[1]);
         const dir = process.argv[2];
         const data = createDataAccess(dir);
         equal(data.dir, dir);
         equal(data.resolve("../file.json"), join(dir, "file.json"));`,
        index_url, dir.path,
    ]);
    await rejects(stat(dir.path), {code: "ENOENT"});
});

test("data reads and writes retain Fluent Filesystem behavior at the confined path", async (t) => {
    const root = await createTemporaryDirectory(t);
    const data = createDataAccess(root.join("data").path);
    const outside = root.join("nested", "record.json");
    await outside.write().json({source: "outside"});

    const subpath = "../nested\\record.json";
    const reader = data.read(subpath);
    await rejects(reader.json(), {code: "ENOENT"});
    equal(await reader.optional().json(), null);

    await data.write(subpath).json({source: "inside"});
    deepEqual(await root.join("data", "nested", "record.json").read().json(), {source: "inside"});
    deepEqual(await data.read("/nested/record.json").json(), {source: "inside"});
    deepEqual(await outside.read().json(), {source: "outside"});
});
