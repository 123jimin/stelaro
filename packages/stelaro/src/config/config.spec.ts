import assert from "node:assert/strict";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";

import type {Promisable} from "@jiminp/tooltool";
import {type as schema} from "arktype";

import {
    createApplication,
    defineApplication,
    LifecycleStateError,
} from "../application/index.ts";
import {
    defineComponent,
    defineComponentCalls,
} from "../component/component.ts";
import type {Logger, LoggerFactory} from "../component/logger.ts";
import type {ComponentId} from "../component/types.ts";
import {
    CounterOutput,
    createTempDir,
    EmptyInput,
    noopLoggerFactory,
    writeTestFile,
} from "../test-util.ts";
import {
    ConfigFileError,
    ConfigValidationError,
    SecretsValidationError,
} from "./error.ts";

const ValueConfig = schema({value: "number"});

type ValueContext = {readonly config: {value: number}};

type ValueHooks = {
    readonly start?: (context: ValueContext) => Promisable<void>;
    readonly onConfigReload?: (context: ValueContext) => Promisable<void>;
};

/** Defines a component whose `value` call returns its config `value` as `count`. */
function defineValueComponent<const TId extends ComponentId>(id: TId, hooks: ValueHooks = {}) {
    return defineComponent({
        calls: defineComponentCalls(id, {value: {input: EmptyInput, output: CounterOutput}}),
        uses: [],
        config: ValueConfig,
        handlers: {value: ({config}) => ({count: config.value})},
        ...hooks,
    });
}

describe("@jiminp/stelaro configuration", () => {
    let base_dir: string;

    beforeEach(async () => {
        base_dir = await createTempDir("config");
    });

    afterEach(async () => {
        await rm(base_dir, {recursive: true});
    });

    it("provides validated config to component start hooks and handlers", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 42\n");

        let start_value: number | null = null;
        const A = defineValueComponent("a", {start({config}) { start_value = config.value; }});
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(start_value, 42);
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 42});

        await app.stop();
    });

    it("does not provide config to components without a config schema", async () => {
        const ACalls = defineComponentCalls("a", {
            run: {input: EmptyInput, output: schema({has_config: "boolean"})},
        });
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: (context) => ({has_config: "config" in context}),
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent], logger: noopLoggerFactory}),
            {base_dir},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(ACalls.calls.run, {}), {has_config: false});

        await app.stop();
    });

    it("exposes validated application config on the runtime after start", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\n');

        const app = createApplication(
            defineApplication({
                components: [],
                config: schema({env: "string"}),
                logger: noopLoggerFactory,
            }),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(app.config.env, "dev");

        await app.stop();
    });

    it("supplies missing fields from schema defaults", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\n');

        const app = createApplication(
            defineApplication({
                components: [],
                config: schema({env: "string", port: "number = 3000"}),
                logger: noopLoggerFactory,
            }),
            {base_dir},
        );
        await app.start();

        assert.deepStrictEqual(app.config, {env: "dev", port: 3000});

        await app.stop();
    });

    it("fails startup with ConfigFileError when a declared config file is missing", async () => {
        let started = false;
        const A = defineValueComponent("a", {start() { started = true; }});
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.component_id, "a");
                return true;
            },
        );
        assert.strictEqual(started, false);
        await assert.rejects(() => app.start(), LifecycleStateError);
    });

    it("fails startup with ConfigValidationError without running start hooks", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = "not a number"\n');

        let started = false;
        const A = defineValueComponent("a", {start() { started = true; }});
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigValidationError);
                assert.strictEqual(error.component_id, "a");
                return true;
            },
        );
        assert.strictEqual(started, false);
        await assert.rejects(() => app.start(), LifecycleStateError);
    });
});

describe("@jiminp/stelaro configuration reload", () => {
    let base_dir: string;

    beforeEach(async () => {
        base_dir = await createTempDir("config-reload");
    });

    afterEach(async () => {
        await rm(base_dir, {recursive: true});
    });

    it("swaps application and component config before hooks run", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\n');
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 10\n");

        const hook_calls: string[] = [];
        let hook_value: number | null = null;
        const A = defineValueComponent("a", {
            onConfigReload({config}) {
                hook_calls.push("component");
                hook_value = config.value;
            },
        });
        const app = createApplication(
            defineApplication({
                components: [A],
                config: schema({env: "string"}),
                logger: noopLoggerFactory,
                onConfigReload() {
                    hook_calls.push("application");
                },
            }),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "config.toml"), 'env = "prod"\n');
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 99\n");
        await app.reloadConfig();

        assert.deepStrictEqual(hook_calls, ["component", "application"]);
        assert.strictEqual(hook_value, 99);
        assert.strictEqual(app.config.env, "prod");
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 99});

        await app.stop();
    });

    it("keeps every old config value when any config fails validation", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\n');
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 1\n");
        await writeTestFile(join(base_dir, "b", "config.toml"), "value = 2\n");

        const A = defineValueComponent("a");
        const B = defineValueComponent("b");
        const app = createApplication(
            defineApplication({
                components: [A, B],
                config: schema({env: "string"}),
                logger: noopLoggerFactory,
            }),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "config.toml"), 'env = "prod"\n');
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 10\n");
        await writeTestFile(join(base_dir, "b", "config.toml"), 'value = "bad"\n');
        await assert.rejects(() => app.reloadConfig(), ConfigValidationError);

        assert.strictEqual(app.config.env, "dev");
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 1});
        assert.deepStrictEqual(await app.call(B.calls.calls.value, {}), {count: 2});

        await app.stop();
    });

    it("runs component onConfigReload hooks concurrently", {timeout: 5_000}, async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 1\n");
        await writeTestFile(join(base_dir, "b", "config.toml"), "value = 2\n");

        // Each hook waits until both have started, which only completes if they overlap.
        let arrived = 0;
        let release!: () => void;
        const released = new Promise<void>((resolve) => { release = resolve; });
        const onConfigReload = async (): Promise<void> => {
            arrived += 1;
            if(arrived === 2) release();
            await released;
        };
        const app = createApplication(
            defineApplication({
                components: [defineValueComponent("a", {onConfigReload}), defineValueComponent("b", {onConfigReload})],
                logger: noopLoggerFactory,
            }),
            {base_dir},
        );
        await app.start();

        await app.reloadConfig();

        assert.strictEqual(arrived, 2);

        await app.stop();
    });

    it("runs every component hook, collects their failures, and skips the application hook", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 1\n");
        await writeTestFile(join(base_dir, "b", "config.toml"), "value = 2\n");
        await writeTestFile(join(base_dir, "c", "config.toml"), "value = 3\n");

        const a_error = new Error("a failed");
        const b_error = new Error("b failed");
        let c_reloaded = false;
        let app_reloaded = false;
        const app = createApplication(
            defineApplication({
                components: [
                    defineValueComponent("a", {onConfigReload() { throw a_error; }}),
                    defineValueComponent("b", {onConfigReload() { throw b_error; }}),
                    defineValueComponent("c", {onConfigReload() { c_reloaded = true; }}),
                ],
                logger: noopLoggerFactory,
                onConfigReload() { app_reloaded = true; },
            }),
            {base_dir},
        );
        await app.start();

        await assert.rejects(
            () => app.reloadConfig(),
            (error: unknown) => {
                assert.ok(error instanceof AggregateError);
                assert.deepStrictEqual(new Set(error.errors), new Set([a_error, b_error]));
                return true;
            },
        );
        assert.strictEqual(c_reloaded, true);
        assert.strictEqual(app_reloaded, false);
        await assert.rejects(() => app.reloadConfig(), LifecycleStateError);
    });

    it("moves to failed when the application onConfigReload hook throws", async () => {
        const app = createApplication(
            defineApplication({
                components: [],
                logger: noopLoggerFactory,
                onConfigReload() { throw new Error("app reload failed"); },
            }),
            {base_dir},
        );
        await app.start();

        await assert.rejects(() => app.reloadConfig());
        await assert.rejects(() => app.reloadConfig(), LifecycleStateError);
    });

    it("throws LifecycleStateError when reloadConfig is called outside active state", async () => {
        const app = createApplication(
            defineApplication({components: [], logger: noopLoggerFactory}),
            {base_dir},
        );

        await assert.rejects(() => app.reloadConfig(), LifecycleStateError);
    });

    it("reloads only the target component config and hook with reloadComponentConfig", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 1\n");
        await writeTestFile(join(base_dir, "b", "config.toml"), "value = 2\n");

        const reloaded: string[] = [];
        const A = defineValueComponent("a", {onConfigReload() { reloaded.push("a"); }});
        const B = defineValueComponent("b", {onConfigReload() { reloaded.push("b"); }});
        const app = createApplication(
            defineApplication({components: [A, B], logger: noopLoggerFactory}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 10\n");
        await writeTestFile(join(base_dir, "b", "config.toml"), "value = 20\n");
        await app.reloadComponentConfig("a");

        assert.deepStrictEqual(reloaded, ["a"]);
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 10});
        assert.deepStrictEqual(await app.call(B.calls.calls.value, {}), {count: 2});

        // @ts-expect-error reloadComponentConfig accepts only registered component ids.
        void (() => app.reloadComponentConfig("missing"));

        await app.stop();
    });

    it("rejects reloadComponentConfig on validation failure and preserves old config", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 1\n");

        const A = defineValueComponent("a");
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = "bad"\n');
        await assert.rejects(() => app.reloadComponentConfig("a"), ConfigValidationError);

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 1});

        await app.stop();
    });

    it("throws LifecycleStateError when reloadComponentConfig is called outside active state", async () => {
        const app = createApplication(
            defineApplication({components: [defineValueComponent("a")], logger: noopLoggerFactory}),
            {base_dir},
        );

        await assert.rejects(() => app.reloadComponentConfig("a"), LifecycleStateError);
    });
});

describe("@jiminp/stelaro environment config", () => {
    let base_dir: string;

    beforeEach(async () => {
        base_dir = await createTempDir("env-config");
    });

    afterEach(async () => {
        await rm(base_dir, {recursive: true});
    });

    it("merges env overlay onto base component config, including fields absent from the base", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), "initial = 10\n");
        await writeTestFile(join(base_dir, "counter", "config.prod.toml"), "initial = 100\nstep = 1\n");

        const CounterCalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}});
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number", step: "number"}),
            handlers: {
                current: ({config}) => ({count: config.initial + config.step}),
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent], logger: noopLoggerFactory}),
            {base_dir, env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 101});

        await app.stop();
    });

    it("deep-merges env overlay onto base application config", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\nport = 3000\n');
        await writeTestFile(join(base_dir, "config.staging.toml"), 'env = "staging"\n');

        const app = createApplication(
            defineApplication({
                components: [],
                config: schema({env: "string", port: "number"}),
                logger: noopLoggerFactory,
            }),
            {base_dir, env: "staging"},
        );
        await app.start();

        assert.deepStrictEqual(app.config, {env: "staging", port: 3000});

        await app.stop();
    });

    it("uses base config alone when env overlay file is missing", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 10\n");

        const A = defineValueComponent("a");
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir, env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 10});

        await app.stop();
    });

    it("fails startup with ConfigValidationError when the overlay makes the merged config invalid", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 10\n");
        await writeTestFile(join(base_dir, "a", "config.prod.toml"), 'value = "bad"\n');

        const app = createApplication(
            defineApplication({components: [defineValueComponent("a")], logger: noopLoggerFactory}),
            {base_dir, env: "prod"},
        );

        await assert.rejects(() => app.start(), ConfigValidationError);
    });

    it("reloadConfig applies env overlay", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), "value = 10\n");
        await writeTestFile(join(base_dir, "a", "config.prod.toml"), "value = 100\n");

        const A = defineValueComponent("a");
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir, env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 100});

        await writeTestFile(join(base_dir, "a", "config.prod.toml"), "value = 200\n");
        await app.reloadConfig();

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 200});

        await app.stop();
    });

    it("reloadComponentConfig applies env overlay and does not reload secrets", async () => {
        await writeTestFile(join(base_dir, "vault", "config.toml"), 'label = "v1"\n');
        await writeTestFile(join(base_dir, "vault", "config.prod.toml"), 'label = "prod-v1"\n');
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-original"\n');

        const VaultCalls = defineComponentCalls("vault", {
            get: {input: EmptyInput, output: schema({key: "string", label: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            config: schema({label: "string"}),
            secrets: schema({api_key: "string"}),
            handlers: {
                get: ({config, secrets}) => ({key: secrets.api_key, label: config.label}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger: noopLoggerFactory}),
            {base_dir, env: "prod"},
        );
        await app.start();

        await writeTestFile(join(base_dir, "vault", "config.prod.toml"), 'label = "prod-v2"\n');
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-changed"\n');
        await app.reloadComponentConfig("vault");

        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {key: "sk-original", label: "prod-v2"});

        await app.stop();
    });
});

describe("@jiminp/stelaro secrets", () => {
    let base_dir: string;

    beforeEach(async () => {
        base_dir = await createTempDir("secrets");
    });

    afterEach(async () => {
        await rm(base_dir, {recursive: true});
    });

    it("provides validated secrets to component start hooks and handlers", async () => {
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-123"\n');

        let start_secret: string | null = null;
        const VaultCalls = defineComponentCalls("vault", {
            get_key: {input: EmptyInput, output: schema({key: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({api_key: "string"}),
            start({secrets}) {
                start_secret = secrets.api_key;
            },
            handlers: {
                get_key: ({secrets}) => ({key: secrets.api_key}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger: noopLoggerFactory}),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(start_secret, "sk-123");
        assert.deepStrictEqual(await app.call(VaultCalls.calls.get_key, {}), {key: "sk-123"});

        await app.stop();
    });

    it("does not provide secrets to components without a secrets schema", async () => {
        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: schema({has_secrets: "boolean"})}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: (context) => ({has_secrets: "secrets" in context}),
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent], logger: noopLoggerFactory}),
            {base_dir},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(ACalls.calls.run, {}), {has_secrets: false});

        await app.stop();
    });

    it("warns from the component scope and validates an empty object when the secrets file is missing", async () => {
        const warnings: string[] = [];
        const noop = (): void => {};
        const logger: LoggerFactory = (scope): Logger => ({
            debug: noop,
            info: noop,
            warn() { warnings.push(scope); },
            error: noop,
        });

        const VaultCalls = defineComponentCalls("vault", {
            get_key: {input: EmptyInput, output: schema({key: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({"api_key?": "string"}),
            handlers: {
                get_key: ({secrets}) => ({key: secrets.api_key ?? "none"}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger}),
            {base_dir},
        );
        await app.start();

        assert.deepStrictEqual(warnings, ["vault"]);
        assert.deepStrictEqual(await app.call(VaultCalls.calls.get_key, {}), {key: "none"});

        await app.stop();
    });

    it("exposes validated application secrets on the runtime", async () => {
        await writeTestFile(join(base_dir, "secrets.toml"), 'master_key = "mk-abc"\n');

        const app = createApplication(
            defineApplication({
                components: [],
                secrets: schema({master_key: "string"}),
                logger: noopLoggerFactory,
            }),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(app.secrets.master_key, "mk-abc");

        await app.stop();
    });

    it("deep-merges env overlay onto base secrets", async () => {
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-dev"\ndb_pass = "local"\n');
        await writeTestFile(join(base_dir, "vault", "secrets.prod.toml"), 'db_pass = "prod-secret"\n');

        const VaultCalls = defineComponentCalls("vault", {
            get: {input: EmptyInput, output: schema({api_key: "string", db_pass: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({api_key: "string", db_pass: "string"}),
            handlers: {
                get: ({secrets}) => ({api_key: secrets.api_key, db_pass: secrets.db_pass}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger: noopLoggerFactory}),
            {base_dir, env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {api_key: "sk-dev", db_pass: "prod-secret"});

        await app.stop();
    });

    it("does not reload secrets during reloadConfig", async () => {
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-original"\n');
        await writeTestFile(join(base_dir, "vault", "config.toml"), 'label = "v1"\n');

        const VaultCalls = defineComponentCalls("vault", {
            get: {input: EmptyInput, output: schema({key: "string", label: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            config: schema({label: "string"}),
            secrets: schema({api_key: "string"}),
            handlers: {
                get: ({config, secrets}) => ({key: secrets.api_key, label: config.label}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger: noopLoggerFactory}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-changed"\n');
        await writeTestFile(join(base_dir, "vault", "config.toml"), 'label = "v2"\n');
        await app.reloadConfig();

        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {key: "sk-original", label: "v2"});

        await app.stop();
    });

    it("fails startup with SecretsValidationError without running start hooks", async () => {
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), "api_key = 42\n");

        let started = false;
        const VaultCalls = defineComponentCalls("vault", {run: {input: EmptyInput, output: CounterOutput}});
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({api_key: "string"}),
            start() { started = true; },
            handlers: {
                run: () => ({count: 0}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger: noopLoggerFactory}),
            {base_dir},
        );

        await assert.rejects(() => app.start(), SecretsValidationError);
        assert.strictEqual(started, false);
        await assert.rejects(() => app.start(), LifecycleStateError);
    });
});
