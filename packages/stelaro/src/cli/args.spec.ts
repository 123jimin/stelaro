import assert from "node:assert/strict";
import {resolve} from "node:path";
import {describe, it} from "node:test";

import {createApplication, defineApplication} from "../application/index.ts";
import {noopLoggerFactory} from "../test-util.ts";
import {parseArgs} from "./args.ts";

/** Runs `fn` with `process.argv` holding `args` after the executable and script paths. */
function withProcessArgs<T>(args: readonly string[], fn: () => T): T {
    const original = process.argv;
    process.argv = [original[0]!, original[1]!, ...args];
    try {
        return fn();
    } finally {
        process.argv = original;
    }
}

/** Asserts that parsing `argv` throws an error that names the offending argument, not an incidental failure. */
function assertRejectsArgument(argv: string[], offending: string): void {
    assert.throws(() => parseArgs(argv), (error: unknown) => {
        assert.ok(error instanceof Error, argv.join(" "));
        assert.ok(error.message.includes(offending), `${argv.join(" ")}: ${error.message}`);
        return true;
    });
}

describe("@jiminp/stelaro CLI argument parsing", () => {
    it("returns null for every argument when no arguments are provided", () => {
        assert.deepStrictEqual(parseArgs([]), {base_dir: null, config_dir: null, secrets_dir: null, data_dir: null, env: null});
    });

    it("returns each argument as given, leaving directory resolution to the application", () => {
        const args = parseArgs(["--base-dir", "./app/../app", "--config-dir", "c", "--secrets-dir", "/abs/s", "--data-dir", "d/", "--env", "test"]);

        assert.deepStrictEqual(args, {base_dir: "./app/../app", config_dir: "c", secrets_dir: "/abs/s", data_dir: "d/", env: "test"});
    });

    it("leaves arguments that are not supplied null", () => {
        assert.deepStrictEqual(parseArgs(["--env", "prod"]), {base_dir: null, config_dir: null, secrets_dir: null, data_dir: null, env: "prod"});
    });

    it("keeps spaces, non-ASCII text, and empty strings in values", () => {
        assert.deepStrictEqual(
            parseArgs(["--base-dir", "my app/데이터", "--env", ""]),
            {base_dir: "my app/데이터", config_dir: null, secrets_dir: null, data_dir: null, env: ""},
        );
    });

    it("parses process arguments after the executable and script paths by default", () => {
        const args = withProcessArgs(["--env", "staging", "--data-dir", "d"], () => parseArgs());

        assert.deepStrictEqual(args, {base_dir: null, config_dir: null, secrets_dir: null, data_dir: "d", env: "staging"});
    });

    it("throws on unknown options", () => {
        for(const [argv, offending] of [
            [["--bogus"], "--bogus"],
            [["--bogus=1"], "--bogus"],
            [["--ENV", "x"], "--ENV"],
            [["-e", "x"], "-e"],
            [["--env", "x", "--port", "80"], "--port"],
        ] as const) {
            assertRejectsArgument([...argv], offending);
        }
    });

    it("throws on positional arguments", () => {
        for(const [argv, offending] of [
            [["something"], "something"],
            [["--env", "x", "extra"], "extra"],
            [["--", "something"], "something"],
        ] as const) {
            assertRejectsArgument([...argv], offending);
        }
    });

    it("throws when an option has no value", () => {
        for(const option of ["--base-dir", "--config-dir", "--secrets-dir", "--data-dir", "--env"]) {
            assertRejectsArgument([option], option);
        }
    });

    it("createApplication does not parse process arguments", () => {
        const app = withProcessArgs(
            ["--data-dir", "elsewhere", "--bogus"],
            () => createApplication(defineApplication({components: [], logger: noopLoggerFactory})),
        );

        assert.strictEqual(app.data.dir, resolve("data"));
    });
});

function assertTypeBehavior() {
    // A CLI entrypoint can pass parsed arguments as application options.
    void createApplication(defineApplication({components: []}), parseArgs());
}

void assertTypeBehavior;
