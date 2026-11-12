import {deepEqual, throws} from "node:assert/strict";
import {test} from "node:test";

import type {ApplicationOptions} from "../index.ts";
import {parseArgs} from "../index.ts";

test("parseArgs preserves strings and returns startup options", () => {
    const options: ApplicationOptions = parseArgs([
        "--base-dir", "./service/../app",
        "--config-dir=./custom config",
        "--secrets-dir", "C:\\private",
        "--data-dir", "",
        "--env", " Prod.EU ",
    ]);
    deepEqual(options, {
        base_dir: "./service/../app",
        config_dir: "./custom config",
        secrets_dir: "C:\\private",
        data_dir: "",
        env: " Prod.EU ",
    });
});

test("parseArgs defaults to the process arguments after the executable and script", () => {
    const original_argv = process.argv;
    try {
        process.argv = ["node", "main.js", "--env", "production"];
        deepEqual(parseArgs(), {
            base_dir: null,
            config_dir: null,
            secrets_dir: null,
            data_dir: null,
            env: "production",
        });
    } finally {
        process.argv = original_argv;
    }
});

test("parseArgs rejects unknown flags, positional arguments, and missing values", () => {
    throws(() => parseArgs(["--unknown"]), TypeError);
    throws(() => parseArgs(["production"]), TypeError);
    throws(() => parseArgs(["--", "production"]), TypeError);
    throws(() => parseArgs(["--env"]), TypeError);
});
