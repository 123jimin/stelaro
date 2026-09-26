import assert from "node:assert/strict";
import {resolve} from "node:path";
import {describe, it} from "node:test";

import {createApplication, defineApplication} from "../application/index.ts";
import {parseArgs} from "./args.ts";

describe("@jiminp/stelaro CLI argument parsing", () => {
    it("returns undefined for base_dir and null for env when no arguments are provided", () => {
        const args = parseArgs([]);

        assert.strictEqual(args.base_dir, void 0);
        assert.strictEqual(args.env, null);
    });

    it("resolves --base-dir to an absolute path and passes --env through", () => {
        const args = parseArgs(["--base-dir", "./app", "--env", "test"]);

        assert.strictEqual(args.base_dir, resolve("./app"));
        assert.strictEqual(args.env, "test");
    });

    it("throws on unknown arguments", () => {
        assert.throws(() => parseArgs(["--bogus"]));
    });

    it("throws on positional arguments", () => {
        assert.throws(() => parseArgs(["something"]));
    });

    it("throws when --env has no value", () => {
        assert.throws(() => parseArgs(["--env"]));
    });
});

// A CLI entrypoint can pass parsed arguments as application options.
void (() => createApplication(defineApplication({components: []}), parseArgs()));
