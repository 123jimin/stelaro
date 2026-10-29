import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createApplication, defineApplication} from "../application/index.ts";
import {parseArgs} from "./args.ts";

describe("@jiminp/stelaro CLI argument parsing", () => {
    it("returns null for every argument when no arguments are provided", () => {
        assert.deepStrictEqual(parseArgs([]), {base_dir: null, config_dir: null, secrets_dir: null, data_dir: null, env: null});
    });

    it("returns directory arguments as given, leaving resolution to the application", () => {
        const args = parseArgs(["--base-dir", "./app", "--config-dir", "c", "--secrets-dir", "s", "--data-dir", "d", "--env", "test"]);

        assert.deepStrictEqual(args, {base_dir: "./app", config_dir: "c", secrets_dir: "s", data_dir: "d", env: "test"});
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

function assertTypeBehavior() {
    // A CLI entrypoint can pass parsed arguments as application options.
    void createApplication(defineApplication({components: []}), parseArgs());
}

void assertTypeBehavior;
