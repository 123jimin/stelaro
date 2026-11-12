import {deepEqual, equal, throws} from "node:assert/strict";
import {dirname, join, resolve, sep} from "node:path";
import {test} from "node:test";

import {componentFilePath, DEFAULT_APPLICATION_DIRS, InvalidComponentFileNameError, parseArgs} from "../index.ts";
import {resolveApplicationDirectories} from "./directories.ts";

test("application directories default to the working directory and its subdirectories", () => {
    const working_dir = process.cwd();
    deepEqual(DEFAULT_APPLICATION_DIRS, {config_dir: "config", secrets_dir: "secrets", data_dir: "data"});
    const expected = {
        base_dir: working_dir,
        config_dir: join(working_dir, "config"),
        secrets_dir: join(working_dir, "secrets"),
        data_dir: join(working_dir, "data"),
    };
    deepEqual(resolveApplicationDirectories(), expected);
    deepEqual(resolveApplicationDirectories(parseArgs([])), expected);
});

test("application directories resolve relative overrides against their specified bases", () => {
    const options = parseArgs(["--base-dir", "./service", "--config-dir", "./settings", "--secrets-dir", "../private"]);
    deepEqual(resolveApplicationDirectories(options), {
        base_dir: resolve("service"),
        config_dir: resolve("service", "settings"),
        secrets_dir: resolve("private"),
        data_dir: resolve("service", "data"),
    });
});

test("application directories honor absolute overrides", () => {
    const base_dir = resolve("service");
    const config_dir = resolve("settings");
    const secrets_dir = resolve("private");
    const data_dir = resolve("storage");
    deepEqual(resolveApplicationDirectories({base_dir, config_dir, secrets_dir, data_dir}), {
        base_dir,
        config_dir,
        secrets_dir,
        data_dir,
    });
});

test("component file paths use the base and overlay filenames in the requested directory", () => {
    const config_dir = join("service", "config");
    const secrets_dir = resolve("service", "secrets");
    equal(componentFilePath(config_dir, "web-api", null), join(config_dir, "web-api.toml"));
    equal(componentFilePath(secrets_dir, "web-api", "prod.eu"), join(secrets_dir, "web-api.prod.eu.toml"));
    equal(dirname(componentFilePath(secrets_dir, "web-api", "")), secrets_dir);
    equal(componentFilePath(secrets_dir, "web-api", ""), join(secrets_dir, "web-api..toml"));
});

test("component file paths reject filenames that cannot stay directly in the directory", () => {
    throws(() => componentFilePath("config", "../private", null), {
        name: InvalidComponentFileNameError.name,
        file_name: "../private.toml",
    });
    for(const env of ["a/../../private", "bad\0name"]) {
        throws(() => componentFilePath("config", "web-api", env), InvalidComponentFileNameError);
    }
    for(const env of ["a\\..\\..\\private", "prod:stream"]) {
        if(sep === "\\") {
            throws(() => componentFilePath("config", "web-api", env), InvalidComponentFileNameError);
        } else {
            equal(componentFilePath("config", "web-api", env), join("config", `web-api.${env}.toml`));
        }
    }
});
