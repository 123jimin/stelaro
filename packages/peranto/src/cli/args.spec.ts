import assert from "node:assert/strict";
import {isAbsolute, resolve} from "node:path";
import {describe, it} from "node:test";

import {parseArgs} from "./args.ts";

describe("@jiminp/peranto CLI argument parsing", () => {
    it("returns undefined for config_dir when no arguments are provided", () => {
        const args = parseArgs([]);

        assert.strictEqual(args.config_dir, void 0);
    });

    it("resolves --config-dir to an absolute path", () => {
        const args = parseArgs(["--config-dir", "./custom-config"]);

        assert.strictEqual(args.config_dir, resolve("./custom-config"));
        assert.ok(isAbsolute(args.config_dir!));
    });

    it("resolves --config-dir with equals syntax to an absolute path", () => {
        const args = parseArgs(["--config-dir=./custom-config"]);

        assert.strictEqual(args.config_dir, resolve("./custom-config"));
    });

    it("preserves an already-absolute --config-dir path", () => {
        const absolute_path = resolve("/tmp/config");
        const args = parseArgs(["--config-dir", absolute_path]);

        assert.strictEqual(args.config_dir, absolute_path);
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
});
