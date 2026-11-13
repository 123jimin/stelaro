import {deepEqual, equal, ok, rejects} from "node:assert/strict";
import {test} from "node:test";

import {assertEqualType} from "@jiminp/tooltool";
import {type} from "arktype";
import {TomlError} from "smol-toml";

import {
    ConfigFileError, ConfigValidationError, defineComponent, defineComponentCalls, NotRegularFileError, SecretsFileError, SecretsValidationError,
} from "../index.ts";
import {createTemporaryDirectory} from "../test-util.ts";
import {loadComponentConfig, loadComponentSecrets} from "./load.ts";

const calls = defineComponentCalls("worker", {});

test("undeclared configuration and secrets skip path resolution, I/O, and warnings", async () => {
    const component = defineComponent({calls, uses: [], handlers: {}});
    const warnings: unknown[][] = [];
    const result = await loadComponentSecrets(component, "missing", "invalid/overlay", {warn: (...args) => warnings.push(args)});

    equal(result, null);
    equal(await loadComponentConfig(component, "missing", "invalid/overlay"), null);
    deepEqual(warnings, []);
});

test("a declared config requires its base file even when an overlay or defaults are available", async (t) => {
    const root = await createTemporaryDirectory(t);
    const config = type({enabled: "boolean = true"});
    const component = defineComponent({calls, uses: [], handlers: {}, config});
    await root.join("worker.dev.toml").write().text("enabled = false");

    await rejects(loadComponentConfig(component, root.path, "dev"), (error: unknown) => {
        ok(error instanceof ConfigFileError);
        equal(error.component_id, "worker");
        equal(error.file_path, root.join("worker.toml").path);
        ok(error.cause instanceof Error && "code" in error.cause);
        equal(error.cause.code, "ENOENT");
        return true;
    });
});

test("configuration validates after merging, uses defaults, and ignores missing overlays", async (t) => {
    const root = await createTemporaryDirectory(t);
    const config = type({label: "string", enabled: "boolean = true"});
    const component = defineComponent({calls, uses: [], handlers: {}, config});
    const base = root.join("worker.toml");
    const overlay = root.join("worker.dev.toml");
    await base.write().text("label = 123");
    await overlay.write().text('label = "overlay"');

    const result = await loadComponentConfig(component, root.path, "dev");
    assertEqualType<typeof result, {readonly value: {label: string; enabled: boolean}} | null>();
    deepEqual(result, {value: {label: "overlay", enabled: true}});
    await rejects(loadComponentConfig(component, root.path, "missing"), ConfigValidationError);

    await base.write().text('label = "base"');
    deepEqual(await loadComponentConfig(component, root.path, "missing"), {value: {label: "base", enabled: true}});
    await overlay.write().text("label = [");
    await rejects(loadComponentConfig(component, root.path, "dev"), (error: unknown) => {
        ok(error instanceof ConfigFileError);
        equal(error.file_path, overlay.path);
        ok(error.cause instanceof TomlError);
        return true;
    });
});

test("missing base secrets warn and allow overlays and schema defaults", async (t) => {
    const root = await createTemporaryDirectory(t);
    const secrets = type({token: "string = 'default'", enabled: "boolean = true"});
    const component = defineComponent({calls, uses: [], handlers: {}, secrets});
    const warnings: unknown[][] = [];
    const logger = {warn: (...args: unknown[]) => { warnings.push(args); }};

    deepEqual(await loadComponentSecrets(component, root.path, "missing", logger), {value: {token: "default", enabled: true}});
    await root.join("worker.dev.toml").write().text('token = "overlay"');
    deepEqual(await loadComponentSecrets(component, root.path, "dev", logger), {value: {token: "overlay", enabled: true}});
    equal(warnings.length, 2);
    ok(warnings.every(([message]) => typeof message === "string" && message.includes("worker.toml") && message.includes("missing")));
});

test("a declared schema can return null without being mistaken for an absent declaration", async (t) => {
    const root = await createTemporaryDirectory(t);
    const secrets = type({token: "string"}).pipe(() => null);
    const component = defineComponent({calls, uses: [], handlers: {}, secrets});
    await root.join("worker.toml").write().text('token = "base"');

    const result = await loadComponentSecrets(component, root.path, null, {warn: t.mock.fn()});
    assertEqualType<typeof result, {readonly value: null} | null>();
    deepEqual(result, {value: null});
});

test("overlays merge tables, replace arrays and date values, and preserve literal keys", async (t) => {
    const root = await createTemporaryDirectory(t);
    const component = defineComponent({calls, uses: [], handlers: {}, secrets: type("unknown")});
    await root.join("worker.toml").write().text(`
        list = [1, 2]
        date = 2025-01-01
        [nested]
        base = 1
        conflict = "base"
    `);
    await root.join("worker.dev.toml").write().text(`
        list = [3]
        [date]
        label = "replacement"
        [nested]
        conflict = "overlay"
        [__proto__]
        flag = true
    `);

    const warnings: unknown[][] = [];
    const result = await loadComponentSecrets(component, root.path, "dev", {warn: (...args) => warnings.push(args)});
    const prototype_key = "__proto__";
    deepEqual(result?.value, {
        list: [3], date: {label: "replacement"}, nested: {base: 1, conflict: "overlay"}, [prototype_key]: {flag: true},
    });
    deepEqual(warnings, []);
});

test("secrets errors distinguish unreadable or malformed files from invalid values", async (t) => {
    const root = await createTemporaryDirectory(t);
    const component = defineComponent({calls, uses: [], handlers: {}, secrets: type({token: "string"})});
    const base = root.join("worker.toml");
    const overlay = root.join("worker.dev.toml");
    const warnings: unknown[][] = [];
    const load = (env: string | null) => loadComponentSecrets(component, root.path, env, {warn: (...args) => warnings.push(args)});

    await base.write().text('token = "base"');
    await overlay.join("child").write().text("");
    await rejects(load("dev"), (error: unknown) => {
        ok(error instanceof SecretsFileError);
        equal(error.file_path, overlay.path);
        ok(error.cause instanceof NotRegularFileError);
        return true;
    });

    await base.write().text("invalid = [");
    await rejects(load(null), (error: unknown) => {
        ok(error instanceof SecretsFileError);
        equal(error.component_id, "worker");
        equal(error.file_path, base.path);
        ok(error.cause instanceof TomlError);
        return true;
    });

    await base.write().text("token = 123");
    await rejects(load(null), (error: unknown) => {
        ok(error instanceof SecretsValidationError);
        equal(error.component_id, "worker");
        ok(error.cause instanceof Error);
        return true;
    });
    deepEqual(warnings, []);
});
