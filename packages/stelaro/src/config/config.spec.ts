import assert from "node:assert/strict";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {describe, it} from "node:test";
import {setImmediate} from "node:timers/promises";

import type {Promisable} from "@jiminp/tooltool";
import {type as schema} from "arktype";

import {
    createApplication,
    defineApplication,
    LifecycleStateError,
    UnregisteredComponentError,
} from "../application/index.ts";
import {
    defineComponent,
    defineComponentCalls,
} from "../component/component.ts";
import type {Logger, LoggerFactory} from "../component/logger.ts";
import type {ComponentId} from "../component/types.ts";
import {EmptyInput} from "../schema.ts";
import {
    CounterOutput,
    noopLoggerFactory,
    useTempDir,
    writeTestFile,
} from "../test-util.ts";
import {
    ConfigFileError,
    ConfigValidationError,
    SecretsFileError,
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

const VaultSecrets = schema({api_key: "string"});

/** Defines a `vault` component whose `get` call returns its `api_key` secret. */
function defineVaultComponent(start: () => void = () => {}) {
    return defineComponent({
        calls: defineComponentCalls("vault", {get: {input: EmptyInput, output: schema({key: "string"})}}),
        uses: [],
        secrets: VaultSecrets,
        start,
        handlers: {get: ({secrets}) => ({key: secrets.api_key})},
    });
}

/** Asserts that `app` is in the `failed` lifecycle state. */
async function assertFailed(app: {start(): Promise<void>}): Promise<void> {
    await assert.rejects(
        () => app.start(),
        (error: unknown) => error instanceof LifecycleStateError && error.current_state === "failed",
    );
}

/** Logger factory that records the scope of every warning. */
function createWarningRecorder(): {readonly logger: LoggerFactory; readonly warnings: string[]} {
    const warnings: string[] = [];
    const noop = (): void => {};
    const logger: LoggerFactory = (scope): Logger => ({
        debug: noop,
        info: noop,
        warn() { warnings.push(scope); },
        error: noop,
    });
    return {logger, warnings};
}

describe("@jiminp/stelaro configuration", () => {
    const tempDir = useTempDir("config");

    it("provides validated config to component start hooks and handlers", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 42\n");

        let start_value: number | null = null;
        const A = defineValueComponent("a", {start({config}) { start_value = config.value; }});
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        assert.strictEqual(start_value, 42);
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 42});

        await app.stop();
    });

    it("ignores config and secrets files of components without schemas", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "not valid = = = toml");
        await writeTestFile(join(tempDir(), "secrets", "a.toml"), "not valid = = = toml");

        const ACalls = defineComponentCalls("a", {
            run: {input: EmptyInput, output: schema({has_config: "boolean", has_secrets: "boolean"})},
        });
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: (context) => ({has_config: "config" in context, has_secrets: "secrets" in context}),
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(ACalls.calls.run, {}), {has_config: false, has_secrets: false});

        await app.stop();
    });

    it("supplies missing fields from schema defaults", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "");

        const ACalls = defineComponentCalls("a", {value: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            config: schema({value: "number = 3000"}),
            handlers: {value: ({config}) => ({count: config.value})},
        });
        const app = createApplication(
            defineApplication({components: [AComponent], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(ACalls.calls.value, {}), {count: 3000});

        await app.stop();
    });

    it("fails startup with ConfigFileError when a config file is not valid TOML", async () => {
        const file_path = join(tempDir(), "config", "a.toml");
        await writeTestFile(file_path, "not valid = = = toml");

        const app = createApplication(
            defineApplication({components: [defineValueComponent("a")], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.component_id, "a");
                assert.strictEqual(error.file_path, file_path);
                return true;
            },
        );
        await assertFailed(app);
    });

    it("fails startup with ConfigFileError when a component's config file is missing, even if defaults cover every field", async () => {
        let started = false;
        const AComponent = defineComponent({
            calls: defineComponentCalls("a", {value: {input: EmptyInput, output: CounterOutput}}),
            uses: [],
            config: schema({value: "number = 3000"}),
            start() { started = true; },
            handlers: {value: ({config}) => ({count: config.value})},
        });
        const app = createApplication(
            defineApplication({components: [AComponent], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.component_id, "a");
                assert.strictEqual(error.file_path, join(tempDir(), "config", "a.toml"));
                return true;
            },
        );
        assert.strictEqual(started, false);
        await assertFailed(app);
    });

    it("validates every component's config before any start hook runs", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), 'value = "not a number"\n');

        const started: string[] = [];
        const app = createApplication(
            defineApplication({
                components: [
                    defineValueComponent("a", {start() { started.push("a"); }}),
                    defineValueComponent("b", {start() { started.push("b"); }}),
                ],
                logger: noopLoggerFactory,
            }),
            {base_dir: tempDir()},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigValidationError);
                assert.strictEqual(error.component_id, "b");
                return true;
            },
        );
        assert.deepStrictEqual(started, []);
        await assertFailed(app);
    });
});

describe("@jiminp/stelaro configuration reload", () => {
    const tempDir = useTempDir("config-reload");

    it("swaps component config before component hooks, then runs the application hook", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");

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
                logger: noopLoggerFactory,
                onConfigReload() {
                    hook_calls.push("application");
                },
            }),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 99\n");
        await app.reloadConfig();

        assert.deepStrictEqual(hook_calls, ["component", "application"]);
        assert.strictEqual(hook_value, 99);
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 99});

        await app.stop();
    });

    it("swaps every component's config before any component hook runs", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");

        const A = defineValueComponent("a");
        const B = defineValueComponent("b");
        let seen: readonly number[] = [];
        const WatcherComponent = defineComponent({
            calls: defineComponentCalls("watcher", {run: {input: EmptyInput, output: CounterOutput}}),
            uses: [A.calls, B.calls],
            async onConfigReload({call}) {
                const a = await call(A.calls.calls.value, {});
                const b = await call(B.calls.calls.value, {});
                seen = [a.count, b.count];
            },
            handlers: {run: () => ({count: 0})},
        });
        const app = createApplication(
            defineApplication({components: [A, B, WatcherComponent], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 20\n");
        await app.reloadConfig();

        assert.deepStrictEqual(seen, [10, 20]);

        await app.stop();
    });

    it("keeps every old config value and runs no hook when any config fails validation", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");

        const reloaded: string[] = [];
        const A = defineValueComponent("a", {onConfigReload() { reloaded.push("a"); }});
        const B = defineValueComponent("b", {onConfigReload() { reloaded.push("b"); }});
        const app = createApplication(
            defineApplication({
                components: [A, B],
                logger: noopLoggerFactory,
                onConfigReload() { reloaded.push("application"); },
            }),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), 'value = "bad"\n');
        await assert.rejects(() => app.reloadConfig(), ConfigValidationError);

        assert.deepStrictEqual(reloaded, []);
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 1});
        assert.deepStrictEqual(await app.call(B.calls.calls.value, {}), {count: 2});

        await app.stop();
    });

    it("keeps every old config value when a config file is not valid TOML during reload", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");

        const A = defineValueComponent("a");
        const B = defineValueComponent("b");
        const app = createApplication(
            defineApplication({components: [A, B], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "not valid = = = toml");
        await assert.rejects(() => app.reloadConfig(), ConfigFileError);

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 1});
        assert.deepStrictEqual(await app.call(B.calls.calls.value, {}), {count: 2});

        await app.stop();
    });

    it("keeps every old config value when a config file is deleted before reload", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");

        const A = defineValueComponent("a");
        const B = defineValueComponent("b");
        const app = createApplication(
            defineApplication({components: [A, B], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await rm(join(tempDir(), "config", "b.toml"));
        await assert.rejects(() => app.reloadConfig(), ConfigFileError);
        await assert.rejects(() => app.reloadComponentConfig("b"), ConfigFileError);

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 1});
        assert.deepStrictEqual(await app.call(B.calls.calls.value, {}), {count: 2});

        await app.stop();
    });

    it("runs component onConfigReload hooks concurrently", {timeout: 5_000}, async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");

        // Each hook waits until both have started, which only completes if they overlap.
        let arrived = 0;
        const gate = Promise.withResolvers<void>();
        const onConfigReload = async (): Promise<void> => {
            arrived += 1;
            if(arrived === 2) gate.resolve();
            await gate.promise;
        };
        const app = createApplication(
            defineApplication({
                components: [defineValueComponent("a", {onConfigReload}), defineValueComponent("b", {onConfigReload})],
                logger: noopLoggerFactory,
            }),
            {base_dir: tempDir()},
        );
        await app.start();

        await app.reloadConfig();

        assert.strictEqual(arrived, 2);

        await app.stop();
    });

    it("runs the application hook only after every component hook completes", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");

        let completed = 0;
        let completed_before_application: number | null = null;
        const onConfigReload = async (): Promise<void> => {
            await setImmediate();
            completed += 1;
        };
        const app = createApplication(
            defineApplication({
                components: [defineValueComponent("a", {onConfigReload}), defineValueComponent("b", {onConfigReload})],
                logger: noopLoggerFactory,
                onConfigReload() { completed_before_application = completed; },
            }),
            {base_dir: tempDir()},
        );
        await app.start();

        await app.reloadConfig();

        assert.strictEqual(completed_before_application, 2);

        await app.stop();
    });

    it("runs every component hook to completion, collects their failures, and skips the application hook", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");
        await writeTestFile(join(tempDir(), "config", "c.toml"), "value = 3\n");

        const a_error = new Error("a failed");
        const b_error = new Error("b failed");
        let c_reloaded = false;
        let app_reloaded = false;
        const app = createApplication(
            defineApplication({
                components: [
                    defineValueComponent("a", {onConfigReload() { throw a_error; }}),
                    defineValueComponent("b", {async onConfigReload() { throw b_error; }}),
                    defineValueComponent("c", {
                        async onConfigReload() {
                            await setImmediate();
                            c_reloaded = true;
                        },
                    }),
                ],
                logger: noopLoggerFactory,
                onConfigReload() { app_reloaded = true; },
            }),
            {base_dir: tempDir()},
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
        await assertFailed(app);
    });

    it("moves to failed when the application onConfigReload hook throws", async () => {
        const app_error = new Error("app reload failed");
        const app = createApplication(
            defineApplication({
                components: [],
                logger: noopLoggerFactory,
                onConfigReload() { throw app_error; },
            }),
            {base_dir: tempDir()},
        );
        await app.start();

        await assert.rejects(() => app.reloadConfig(), (error: unknown) => error === app_error);
        await assertFailed(app);
    });

    it("reloadComponentConfig reloads only the target component's config and runs only its hook", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 2\n");

        const reloaded: string[] = [];
        const A = defineValueComponent("a", {onConfigReload() { reloaded.push("a"); }});
        const B = defineValueComponent("b", {onConfigReload() { reloaded.push("b"); }});
        const app = createApplication(
            defineApplication({
                components: [A, B],
                logger: noopLoggerFactory,
                onConfigReload() { reloaded.push("application"); },
            }),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(join(tempDir(), "config", "b.toml"), "value = 20\n");
        await app.reloadComponentConfig("a");

        assert.deepStrictEqual(reloaded, ["a"]);
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 10});
        assert.deepStrictEqual(await app.call(B.calls.calls.value, {}), {count: 2});

        // @ts-expect-error reloadComponentConfig accepts only registered component ids.
        void (() => app.reloadComponentConfig("missing"));

        await app.stop();
    });

    it("keeps the old config and runs no hook when reloadComponentConfig fails validation", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");

        let reloaded = false;
        const A = defineValueComponent("a", {onConfigReload() { reloaded = true; }});
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "a.toml"), 'value = "bad"\n');
        await assert.rejects(() => app.reloadComponentConfig("a"), ConfigValidationError);

        assert.strictEqual(reloaded, false);
        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 1});

        await app.stop();
    });

    it("rejects reloadComponentConfig for an unregistered component with UnregisteredComponentError", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 1\n");

        const app = createApplication(
            defineApplication({components: [defineValueComponent("a")], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        // A caller outside the type system can still pass any id.
        const component_id: string = "missing";
        await assert.rejects(
            () => app.reloadComponentConfig(component_id as "a"),
            (error: unknown) => {
                assert.ok(error instanceof UnregisteredComponentError);
                assert.strictEqual(error.component_id, "missing");
                return true;
            },
        );

        await app.stop();
    });
});

describe("@jiminp/stelaro environment config", () => {
    const tempDir = useTempDir("env-config");

    it("merges env overlay onto base component config, including fields absent from the base", async () => {
        await writeTestFile(join(tempDir(), "config", "counter.toml"), "initial = 10\n");
        await writeTestFile(join(tempDir(), "config", "counter.prod.toml"), "initial = 100\nstep = 1\n");

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
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 101});

        await app.stop();
    });

    it("deep-merges nested overlay tables, keeping base fields the overlay omits", async () => {
        await writeTestFile(join(tempDir(), "config", "db.toml"), '[pool]\nhost = "localhost"\nport = 5432\n');
        await writeTestFile(join(tempDir(), "config", "db.prod.toml"), '[pool]\nhost = "db.prod"\n');

        const DbCalls = defineComponentCalls("db", {
            get: {input: EmptyInput, output: schema({host: "string", port: "number"})},
        });
        const DbComponent = defineComponent({
            calls: DbCalls,
            uses: [],
            config: schema({pool: {host: "string", port: "number"}}),
            handlers: {get: ({config}) => config.pool},
        });
        const app = createApplication(
            defineApplication({components: [DbComponent], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(DbCalls.calls.get, {}), {host: "db.prod", port: 5432});

        await app.stop();
    });

    it("uses base config alone when env overlay file is missing", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");

        const A = defineValueComponent("a");
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 10});

        await app.stop();
    });

    it("ignores overlays of environments that are not selected", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(join(tempDir(), "config", "a.dev.toml"), "value = 20\n");
        await writeTestFile(join(tempDir(), "config", "a.prod.toml"), "value = 30\n");

        const A = defineValueComponent("a");
        for(const [env, expected] of [[null, 10], ["dev", 20], ["prod", 30]] as const) {
            const app = createApplication(
                defineApplication({components: [A], logger: noopLoggerFactory}),
                {base_dir: tempDir(), env},
            );
            await app.start();

            assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: expected}, String(env));

            await app.stop();
        }
    });

    it("fails startup with ConfigValidationError when the overlay makes the merged config invalid", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(join(tempDir(), "config", "a.prod.toml"), 'value = "bad"\n');

        const app = createApplication(
            defineApplication({components: [defineValueComponent("a")], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );

        await assert.rejects(() => app.start(), ConfigValidationError);
        await assertFailed(app);
    });

    it("fails startup with ConfigFileError when the base config file is missing but the overlay exists", async () => {
        await writeTestFile(join(tempDir(), "config", "a.prod.toml"), "value = 30\n");

        const app = createApplication(
            defineApplication({components: [defineValueComponent("a")], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => error instanceof ConfigFileError && error.file_path === join(tempDir(), "config", "a.toml"),
        );
        await assertFailed(app);
    });

    it("fails startup with ConfigFileError naming the overlay when the overlay is not valid TOML", async () => {
        const overlay_path = join(tempDir(), "config", "a.prod.toml");
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(overlay_path, "not valid = = = toml");

        const app = createApplication(
            defineApplication({components: [defineValueComponent("a")], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.file_path, overlay_path);
                return true;
            },
        );
        await assertFailed(app);
    });

    it("reloadConfig applies env overlay", async () => {
        await writeTestFile(join(tempDir(), "config", "a.toml"), "value = 10\n");
        await writeTestFile(join(tempDir(), "config", "a.prod.toml"), "value = 100\n");

        const A = defineValueComponent("a");
        const app = createApplication(
            defineApplication({components: [A], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 100});

        await writeTestFile(join(tempDir(), "config", "a.prod.toml"), "value = 200\n");
        await app.reloadConfig();

        assert.deepStrictEqual(await app.call(A.calls.calls.value, {}), {count: 200});

        await app.stop();
    });

    it("reloadComponentConfig applies env overlay and does not reload secrets", async () => {
        await writeTestFile(join(tempDir(), "config", "vault.toml"), 'label = "v1"\n');
        await writeTestFile(join(tempDir(), "config", "vault.prod.toml"), 'label = "prod-v1"\n');
        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), 'api_key = "sk-original"\n');

        const VaultCalls = defineComponentCalls("vault", {
            get: {input: EmptyInput, output: schema({key: "string", label: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            config: schema({label: "string"}),
            secrets: VaultSecrets,
            handlers: {
                get: ({config, secrets}) => ({key: secrets.api_key, label: config.label}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "config", "vault.prod.toml"), 'label = "prod-v2"\n');
        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), 'api_key = "sk-changed"\n');
        await app.reloadComponentConfig("vault");

        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {key: "sk-original", label: "prod-v2"});

        await app.stop();
    });
});

describe("@jiminp/stelaro secrets", () => {
    const tempDir = useTempDir("secrets");

    it("provides validated secrets to component start hooks and handlers without a warning", async () => {
        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), 'api_key = "sk-123"\n');

        const {logger, warnings} = createWarningRecorder();
        let start_secret: string | null = null;
        const VaultCalls = defineComponentCalls("vault", {
            get: {input: EmptyInput, output: schema({key: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: VaultSecrets,
            start({secrets}) {
                start_secret = secrets.api_key;
            },
            handlers: {
                get: ({secrets}) => ({key: secrets.api_key}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger}),
            {base_dir: tempDir()},
        );
        await app.start();

        assert.strictEqual(start_secret, "sk-123");
        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {key: "sk-123"});
        assert.deepStrictEqual(warnings, []);

        await app.stop();
    });

    it("warns and validates an empty object when the secrets file is missing", async () => {
        const {logger, warnings} = createWarningRecorder();
        const VaultCalls = defineComponentCalls("vault", {
            get: {input: EmptyInput, output: schema({key: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({api_key: "string = 'default'"}),
            handlers: {
                get: ({secrets}) => ({key: secrets.api_key}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger}),
            {base_dir: tempDir()},
        );
        await app.start();

        assert.notStrictEqual(warnings.length, 0);
        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {key: "default"});

        await app.stop();
    });

    it("fails startup with SecretsValidationError when the secrets file is missing and the schema rejects an empty object", async () => {
        let started = false;
        const app = createApplication(
            defineApplication({components: [defineVaultComponent(() => { started = true; })], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof SecretsValidationError);
                assert.strictEqual(error.component_id, "vault");
                return true;
            },
        );
        assert.strictEqual(started, false);
        await assertFailed(app);
    });

    it("fails startup with SecretsValidationError without running start hooks", async () => {
        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), "api_key = 42\n");

        let started = false;
        const app = createApplication(
            defineApplication({components: [defineVaultComponent(() => { started = true; })], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );

        await assert.rejects(() => app.start(), SecretsValidationError);
        assert.strictEqual(started, false);
        await assertFailed(app);
    });

    it("fails startup with SecretsFileError when a secrets file is not valid TOML", async () => {
        const file_path = join(tempDir(), "secrets", "vault.toml");
        await writeTestFile(file_path, "not valid = = = toml");

        const app = createApplication(
            defineApplication({components: [defineVaultComponent()], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof SecretsFileError);
                assert.strictEqual(error.component_id, "vault");
                assert.strictEqual(error.file_path, file_path);
                return true;
            },
        );
        await assertFailed(app);
    });

    it("deep-merges env overlay onto base secrets", async () => {
        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), 'api_key = "sk-dev"\ndb_pass = "local"\n');
        await writeTestFile(join(tempDir(), "secrets", "vault.prod.toml"), 'db_pass = "prod-secret"\n');

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
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {api_key: "sk-dev", db_pass: "prod-secret"});

        await app.stop();
    });

    it("uses base secrets alone when the env overlay file is missing", async () => {
        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), 'api_key = "sk-base"\n');

        const Vault = defineVaultComponent();
        const app = createApplication(
            defineApplication({components: [Vault], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(Vault.calls.calls.get, {}), {key: "sk-base"});

        await app.stop();
    });

    it("applies the env overlay when the base secrets file is missing", async () => {
        await writeTestFile(join(tempDir(), "secrets", "vault.prod.toml"), 'api_key = "sk-prod"\n');

        const Vault = defineVaultComponent();
        const app = createApplication(
            defineApplication({components: [Vault], logger: noopLoggerFactory}),
            {base_dir: tempDir(), env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(Vault.calls.calls.get, {}), {key: "sk-prod"});

        await app.stop();
    });

    it("does not reload secrets during reloadConfig", async () => {
        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), 'api_key = "sk-original"\n');
        await writeTestFile(join(tempDir(), "config", "vault.toml"), 'label = "v1"\n');

        const VaultCalls = defineComponentCalls("vault", {
            get: {input: EmptyInput, output: schema({key: "string", label: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            config: schema({label: "string"}),
            secrets: VaultSecrets,
            handlers: {
                get: ({config, secrets}) => ({key: secrets.api_key, label: config.label}),
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent], logger: noopLoggerFactory}),
            {base_dir: tempDir()},
        );
        await app.start();

        await writeTestFile(join(tempDir(), "secrets", "vault.toml"), 'api_key = "sk-changed"\n');
        await writeTestFile(join(tempDir(), "config", "vault.toml"), 'label = "v2"\n');
        await app.reloadConfig();

        assert.deepStrictEqual(await app.call(VaultCalls.calls.get, {}), {key: "sk-original", label: "v2"});

        await app.stop();
    });
});
