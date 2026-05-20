import assert from "node:assert/strict";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";

import {type as schema} from "arktype";

import {ConfigFileError, ConfigValidationError} from "./error.ts";
import {loadTomlConfig} from "./loader.ts";

describe("@jiminp/stelaro config loader", () => {
    let temp_dir: string;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "stelaro-config-"));
    });

    afterEach(async () => {
        await rm(temp_dir, {recursive: true});
    });

    it("parses valid TOML and returns a validated object", async () => {
        const file_path = join(temp_dir, "test.toml");
        await writeFile(file_path, 'host = "localhost"\nport = 8080\n');

        const config_schema = schema({host: "string", port: "number"});
        const result = await loadTomlConfig(file_path, config_schema);

        assert.deepStrictEqual(result, {host: "localhost", port: 8080});
    });

    it("throws ConfigFileError on missing file", async () => {
        const file_path = join(temp_dir, "missing.toml");
        const config_schema = schema({host: "string"});

        await assert.rejects(
            () => loadTomlConfig(file_path, config_schema),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.file_path, file_path);
                return true;
            },
        );
    });

    it("throws ConfigFileError on invalid TOML", async () => {
        const file_path = join(temp_dir, "bad.toml");
        await writeFile(file_path, "not valid = = = toml");

        const config_schema = schema({host: "string"});

        await assert.rejects(
            () => loadTomlConfig(file_path, config_schema),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.file_path, file_path);
                return true;
            },
        );
    });

    it("throws ConfigValidationError when parsed TOML fails schema validation", async () => {
        const file_path = join(temp_dir, "invalid.toml");
        await writeFile(file_path, 'host = 42\n');

        const config_schema = schema({host: "string"});

        await assert.rejects(
            () => loadTomlConfig(file_path, config_schema),
            (error: unknown) => {
                assert.ok(error instanceof ConfigValidationError);
                assert.strictEqual(error.file_path, file_path);
                return true;
            },
        );
    });

    it("includes component_id in ConfigFileError when provided", async () => {
        const file_path = join(temp_dir, "missing.toml");
        const config_schema = schema({host: "string"});

        await assert.rejects(
            () => loadTomlConfig(file_path, config_schema, "my-component"),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.component_id, "my-component");
                return true;
            },
        );
    });

    it("includes component_id in ConfigValidationError when provided", async () => {
        const file_path = join(temp_dir, "invalid.toml");
        await writeFile(file_path, 'host = 42\n');

        const config_schema = schema({host: "string"});

        await assert.rejects(
            () => loadTomlConfig(file_path, config_schema, "my-component"),
            (error: unknown) => {
                assert.ok(error instanceof ConfigValidationError);
                assert.strictEqual(error.component_id, "my-component");
                return true;
            },
        );
    });
});
