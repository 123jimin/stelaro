import assert from "node:assert/strict";
import {isAbsolute, resolve} from "node:path";
import {describe, it} from "node:test";

import {parseArgs} from "./args.ts";

describe("@jiminp/stelaro CLI argument parsing", () => {
    it("returns undefined for base_dir and null for env when no arguments are provided", () => {
        const args = parseArgs([]);

        assert.strictEqual(args.base_dir, void 0);
        assert.strictEqual(args.env, null);
    });

    it("resolves --base-dir to an absolute path", () => {
        const args = parseArgs(["--base-dir", "./custom-base"]);

        assert.strictEqual(args.base_dir, resolve("./custom-base"));
        assert.ok(isAbsolute(args.base_dir!));
    });

    it("resolves --base-dir with equals syntax to an absolute path", () => {
        const args = parseArgs(["--base-dir=./custom-base"]);

        assert.strictEqual(args.base_dir, resolve("./custom-base"));
    });

    it("preserves an already-absolute --base-dir path", () => {
        const absolute_path = resolve("/tmp/config");
        const args = parseArgs(["--base-dir", absolute_path]);

        assert.strictEqual(args.base_dir, absolute_path);
    });

    it("throws on unknown arguments", () => {
        assert.throws(
            () => parseArgs(["--bogus"]),
        );
    });

    it("throws on positional arguments", () => {
        assert.throws(
            () => parseArgs(["something"]),
        );
    });

    it("parses --env as a string", () => {
        const args = parseArgs(["--env", "production"]);

        assert.strictEqual(args.env, "production");
    });

    it("parses --env with equals syntax", () => {
        const args = parseArgs(["--env=staging"]);

        assert.strictEqual(args.env, "staging");
    });

    it("parses --env and --base-dir together", () => {
        const args = parseArgs(["--base-dir", "./app", "--env", "test"]);

        assert.strictEqual(args.base_dir, resolve("./app"));
        assert.strictEqual(args.env, "test");
    });
});
