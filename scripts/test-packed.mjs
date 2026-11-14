import {equal} from "node:assert/strict";
import {spawn} from "node:child_process";
import {cp, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import process from "node:process";

async function readManifest(directory) {
    return JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
}

function runCommand(cwd, command, ...args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {cwd, stdio: "inherit"});
        child.once("error", reject);
        child.once("close", (code, signal) => {
            if(code === 0) {
                resolve();
            } else {
                reject(new Error(`${command} ${args.join(" ")} failed (${signal ?? `exit code ${code}`}).`));
            }
        });
    });
}

function runPnpm(cwd, ...args) {
    const pnpm_cli = process.env.npm_execpath;
    if(pnpm_cli == null) {
        throw new Error("Run this smoke test with pnpm test:packed.");
    }
    if(/\.[cm]?js$/iu.test(pnpm_cli)) {
        return runCommand(cwd, process.execPath, pnpm_cli, ...args);
    }
    return runCommand(cwd, pnpm_cli, ...args);
}

const root = join(import.meta.dirname, "..");
const core_dir = join(root, "packages/stelaro");
const adapter_dir = join(root, "packages/stelaro-pino");
const [core, adapter, {packageManager, devDependencies}] = await Promise.all([
    readManifest(core_dir),
    readManifest(adapter_dir),
    readManifest(root),
]);
const consumer_dir = await mkdtemp(join(tmpdir(), "stelaro-consumer-"));

try {
    await runPnpm(core_dir, "pack", "--out", join(consumer_dir, "stelaro.tgz"));
    await runPnpm(adapter_dir, "pack", "--out", join(consumer_dir, "stelaro-pino.tgz"));
    await cp(join(root, "scripts/packed-consumer"), consumer_dir, {recursive: true});
    const core_archive = "file:./stelaro.tgz";
    await writeFile(join(consumer_dir, "package.json"), JSON.stringify({
        "private": true,
        "type": "module",
        packageManager,
        "dependencies": {
            [core.name]: core_archive,
            [adapter.name]: "file:./stelaro-pino.tgz",
            arktype: core.dependencies.arktype,
            pino: adapter.devDependencies.pino,
        },
        "devDependencies": {
            "@types/node": devDependencies["@types/node"],
            "typescript": devDependencies.typescript,
        },
    }));
    // Resolve the adapter's published core version from the matching local tarball.
    await writeFile(join(consumer_dir, "pnpm-workspace.yaml"), JSON.stringify({
        overrides: {[`${adapter.name}>${core.name}@${core.version}`]: core_archive},
    }));

    await runPnpm(consumer_dir, "install", "--no-frozen-lockfile");
    const packed_adapter = await readManifest(join(consumer_dir, "node_modules", adapter.name));
    equal(packed_adapter.dependencies[core.name], core.version);
    equal(packed_adapter.peerDependencies.pino, adapter.peerDependencies.pino);
    await runPnpm(consumer_dir, "exec", "tsc");
    await runCommand(consumer_dir, process.execPath, "dist/index.js");
} finally {
    await rm(consumer_dir, {recursive: true, force: true});
}
