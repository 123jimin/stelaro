import assert from "node:assert/strict";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";

import {type as schema} from "arktype";

import {ConfigFileError, ConfigValidationError, SecretsFileError, SecretsValidationError} from "./error.ts";
import {loadTomlConfig, loadTomlSecrets} from "./loader.ts";

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

    it("deep-merges overlay onto base config", async () => {
        const base_path = join(temp_dir, "config.toml");
        const overlay_path = join(temp_dir, "config.prod.toml");
        await writeFile(base_path, 'host = "localhost"\nport = 8080\n');
        await writeFile(overlay_path, 'host = "0.0.0.0"\n');

        const config_schema = schema({host: "string", port: "number"});
        const result = await loadTomlConfig(base_path, config_schema, null, overlay_path);

        assert.deepStrictEqual(result, {host: "0.0.0.0", port: 8080});
    });

    it("deep-merges nested overlay fields", async () => {
        const base_path = join(temp_dir, "config.toml");
        const overlay_path = join(temp_dir, "config.prod.toml");
        await writeFile(base_path, '[db]\nhost = "localhost"\nport = 5432\n');
        await writeFile(overlay_path, '[db]\nhost = "db.prod"\n');

        const config_schema = schema({db: {host: "string", port: "number"}});
        const result = await loadTomlConfig(base_path, config_schema, null, overlay_path);

        assert.deepStrictEqual(result, {db: {host: "db.prod", port: 5432}});
    });

    it("skips missing overlay file silently", async () => {
        const base_path = join(temp_dir, "config.toml");
        const overlay_path = join(temp_dir, "config.prod.toml");
        await writeFile(base_path, 'host = "localhost"\nport = 8080\n');

        const config_schema = schema({host: "string", port: "number"});
        const result = await loadTomlConfig(base_path, config_schema, null, overlay_path);

        assert.deepStrictEqual(result, {host: "localhost", port: 8080});
    });

    it("throws ConfigFileError when overlay file has invalid TOML", async () => {
        const base_path = join(temp_dir, "config.toml");
        const overlay_path = join(temp_dir, "config.prod.toml");
        await writeFile(base_path, 'host = "localhost"\n');
        await writeFile(overlay_path, "not valid = = = toml");

        const config_schema = schema({host: "string"});

        await assert.rejects(
            () => loadTomlConfig(base_path, config_schema, null, overlay_path),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.file_path, overlay_path);
                return true;
            },
        );
    });
});

describe("@jiminp/stelaro secrets loader", () => {
    let temp_dir: string;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "stelaro-secrets-"));
    });

    afterEach(async () => {
        await rm(temp_dir, {recursive: true});
    });

    it("loads and validates a secrets file", async () => {
        const file_path = join(temp_dir, "secrets.toml");
        await writeFile(file_path, 'api_key = "sk-123"\n');

        const secrets_schema = schema({api_key: "string"});
        const result = await loadTomlSecrets(file_path, secrets_schema);

        assert.deepStrictEqual(result, {value: {api_key: "sk-123"}, base_found: true});
    });

    it("returns base_found false and empty validated object when file is missing", async () => {
        const file_path = join(temp_dir, "secrets.toml");
        const secrets_schema = schema({"api_key?": "string"});

        const result = await loadTomlSecrets(file_path, secrets_schema);

        assert.strictEqual(result.base_found, false);
    });

    it("throws SecretsValidationError when missing file yields invalid empty object", async () => {
        const file_path = join(temp_dir, "secrets.toml");
        const secrets_schema = schema({api_key: "string"});

        await assert.rejects(
            () => loadTomlSecrets(file_path, secrets_schema),
            (error: unknown) => {
                assert.ok(error instanceof SecretsValidationError);
                return true;
            },
        );
    });

    it("throws SecretsFileError on invalid TOML", async () => {
        const file_path = join(temp_dir, "secrets.toml");
        await writeFile(file_path, "not valid = = = toml");

        const secrets_schema = schema({api_key: "string"});

        await assert.rejects(
            () => loadTomlSecrets(file_path, secrets_schema),
            (error: unknown) => {
                assert.ok(error instanceof SecretsFileError);
                return true;
            },
        );
    });

    it("deep-merges overlay onto base secrets", async () => {
        const base_path = join(temp_dir, "secrets.toml");
        const overlay_path = join(temp_dir, "secrets.prod.toml");
        await writeFile(base_path, 'api_key = "sk-dev"\ndb_pass = "local"\n');
        await writeFile(overlay_path, 'db_pass = "prod-secret"\n');

        const secrets_schema = schema({api_key: "string", db_pass: "string"});
        const result = await loadTomlSecrets(base_path, secrets_schema, null, overlay_path);

        assert.deepStrictEqual(result, {
            value: {api_key: "sk-dev", db_pass: "prod-secret"},
            base_found: true,
        });
    });

    it("applies overlay even when base file is missing", async () => {
        const base_path = join(temp_dir, "secrets.toml");
        const overlay_path = join(temp_dir, "secrets.prod.toml");
        await writeFile(overlay_path, 'api_key = "sk-prod"\n');

        const secrets_schema = schema({api_key: "string"});
        const result = await loadTomlSecrets(base_path, secrets_schema, null, overlay_path);

        assert.deepStrictEqual(result, {
            value: {api_key: "sk-prod"},
            base_found: false,
        });
    });

    it("skips missing overlay file silently", async () => {
        const base_path = join(temp_dir, "secrets.toml");
        const overlay_path = join(temp_dir, "secrets.prod.toml");
        await writeFile(base_path, 'api_key = "sk-123"\n');

        const secrets_schema = schema({api_key: "string"});
        const result = await loadTomlSecrets(base_path, secrets_schema, null, overlay_path);

        assert.deepStrictEqual(result, {value: {api_key: "sk-123"}, base_found: true});
    });
});
