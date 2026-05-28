import assert from "node:assert/strict";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {afterEach, beforeEach, describe, it} from "node:test";

import {type as schema} from "arktype";

import {
    createApplication,
    defineApplication,
} from "../application/application.ts";
import {LifecycleStateError} from "../application/lifecycle.ts";
import {
    defineComponent,
    defineComponentCalls,
} from "../component/component.ts";
import type {Logger} from "../component/logger.ts";
import {StelaroError} from "../error.ts";
import {
    CounterOutput,
    createTempDir,
    EmptyInput,
    writeTestFile,
} from "../test-util.ts";
import {ConfigFileError, ConfigValidationError, SecretsValidationError} from "./error.ts";

describe("@jiminp/stelaro configuration", () => {
    let base_dir: string;

    beforeEach(async () => {
        base_dir = await createTempDir("config");
    });

    afterEach(async () => {
        await rm(base_dir, {recursive: true});
    });

    it("provides validated config to component handlers after start", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );
        await app.start();

        const result = await app.call(CounterCalls.calls.current, {});
        assert.deepStrictEqual(result, {count: 10});

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
                run: {
                    handle(context) {
                        return {has_config: "config" in context};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent]}),
            {base_dir},
        );
        await app.start();

        const result = await app.call(ACalls.calls.run, {});
        assert.deepStrictEqual(result, {has_config: false});

        await app.stop();
    });

    it("exposes validated application config on the runtime after start", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\n');

        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(
            defineApplication({
                components: [AComponent],
                config: schema({env: "string"}),
            }),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(app.config.env, "dev");

        await app.stop();
    });

    it("makes config available in component start hooks", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 42\n');

        let start_config_value: number | undefined;
        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            start(context) {
                start_config_value = context.config.initial;
            },
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(start_config_value, 42);

        await app.stop();
    });

    it("throws ConfigFileError when a config file is missing for a component with a config schema", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigFileError);
                assert.strictEqual(error.component_id, "counter");
                return true;
            },
        );
    });

    it("throws ConfigValidationError when config fails schema validation", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = "not a number"\n');

        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof ConfigValidationError);
                assert.strictEqual(error.component_id, "counter");
                return true;
            },
        );
    });

    it("transitions to failed on config error during start", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );

        await assert.rejects(() => app.start(), ConfigFileError);

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof LifecycleStateError);
                return true;
            },
        );
    });

    it("reloads all config with reloadConfig", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 10});

        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 99\n');
        await app.reloadConfig();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 99});

        await app.stop();
    });

    it("rejects reloadConfig on validation failure and preserves old config", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = "bad"\n');
        await assert.rejects(() => app.reloadConfig(), ConfigValidationError);

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 10});

        await app.stop();
    });

    it("calls all onConfigReload hooks concurrently", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 1\n');
        await writeTestFile(join(base_dir, "b", "config.toml"), 'value = 2\n');

        const reloaded = new Set<string>();

        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            config: schema({value: "number"}),
            onConfigReload() {
                reloaded.add("a");
            },
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [ACalls],
            config: schema({value: "number"}),
            onConfigReload() {
                reloaded.add("b");
            },
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [BComponent, AComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 10\n');
        await writeTestFile(join(base_dir, "b", "config.toml"), 'value = 20\n');
        await app.reloadConfig();

        assert.deepStrictEqual(reloaded, new Set(["a", "b"]));

        await app.stop();
    });

    it("throws LifecycleStateError when reloadConfig is called outside active state", async () => {
        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent]}),
            {base_dir},
        );

        await assert.rejects(() => app.reloadConfig(), LifecycleStateError);
    });

    it("reloads a single component config with reloadComponentConfig", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 1\n');
        await writeTestFile(join(base_dir, "b", "config.toml"), 'value = 2\n');

        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            config: schema({value: "number"}),
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            config: schema({value: "number"}),
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent, BComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 99\n');
        await app.reloadComponentConfig("a");

        assert.deepStrictEqual(await app.call(ACalls.calls.run, {}), {count: 99});
        assert.deepStrictEqual(await app.call(BCalls.calls.run, {}), {count: 2});

        await app.stop();
    });

    it("calls only the target component onConfigReload hook for reloadComponentConfig", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 1\n');
        await writeTestFile(join(base_dir, "b", "config.toml"), 'value = 2\n');

        const reload_calls: string[] = [];

        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            config: schema({value: "number"}),
            onConfigReload() { reload_calls.push("a"); },
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            config: schema({value: "number"}),
            onConfigReload() { reload_calls.push("b"); },
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent, BComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 99\n');
        await app.reloadComponentConfig("a");

        assert.deepStrictEqual(reload_calls, ["a"]);

        await app.stop();
    });

    it("rejects reloadComponentConfig on validation failure and preserves old config", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = "bad"\n');
        await assert.rejects(() => app.reloadComponentConfig("counter"), ConfigValidationError);

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 10});

        await app.stop();
    });

    it("throws LifecycleStateError when reloadComponentConfig is called outside active state", async () => {
        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            config: schema({value: "number"}),
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent]}),
            {base_dir},
        );

        await assert.rejects(() => app.reloadComponentConfig("a"), LifecycleStateError);
    });

    it("treats reloadComponentConfig as a no-op for a component without config schema", async () => {
        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent]}),
            {base_dir},
        );
        await app.start();

        await app.reloadComponentConfig("a");

        await app.stop();
    });

    it("transitions to failed with AggregateError when onConfigReload hook throws", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            onConfigReload() {
                throw new Error("reload failed");
            },
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 99\n');
        await assert.rejects(() => app.reloadConfig(), AggregateError);

        await assert.rejects(() => app.reloadConfig(), LifecycleStateError);
    });

    it("runs all onConfigReload hooks even when one throws", async () => {
        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 1\n');
        await writeTestFile(join(base_dir, "b", "config.toml"), 'value = 2\n');

        const reloaded = new Set<string>();

        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            config: schema({value: "number"}),
            onConfigReload() {
                reloaded.add("a");
                throw new Error("a failed");
            },
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [ACalls],
            config: schema({value: "number"}),
            onConfigReload() {
                reloaded.add("b");
            },
            handlers: {
                run: {handle(context) { return {count: context.config.value}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [BComponent, AComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "a", "config.toml"), 'value = 10\n');
        await writeTestFile(join(base_dir, "b", "config.toml"), 'value = 20\n');
        await assert.rejects(() => app.reloadConfig(), AggregateError);

        assert.deepStrictEqual(reloaded, new Set(["a", "b"]));

        await app.stop();
    });

    it("calls application onConfigReload hook after all component hooks", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\n');
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const hook_order: string[] = [];

        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            onConfigReload() {
                hook_order.push("component");
            },
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({
                components: [CounterComponent],
                config: schema({env: "string"}),
                onConfigReload() {
                    hook_order.push("application");
                },
            }),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "config.toml"), 'env = "prod"\n');
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 99\n');
        await app.reloadConfig();

        assert.deepStrictEqual(hook_order, ["component", "application"]);

        await app.stop();
    });

    it("config errors extend StelaroError", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir},
        );

        try {
            await app.start();
            assert.fail("Expected ConfigFileError");
        } catch (error) {
            assert.ok(error instanceof StelaroError);
            assert.ok(error instanceof ConfigFileError);
        }
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

    it("deep-merges env overlay onto base component config", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\nstep = 1\n');
        await writeTestFile(join(base_dir, "counter", "config.prod.toml"), 'initial = 100\n');

        const CounterCalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}});
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number", step: "number"}),
            handlers: {
                current: {
                    handle(context) {
                        return {count: context.config.initial + context.config.step};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir, env: "prod"},
        );
        await app.start();

        const result = await app.call(CounterCalls.calls.current, {});
        assert.deepStrictEqual(result, {count: 101});

        await app.stop();
    });

    it("deep-merges env overlay onto base application config", async () => {
        await writeTestFile(join(base_dir, "config.toml"), 'env = "dev"\nport = 3000\n');
        await writeTestFile(join(base_dir, "config.staging.toml"), 'env = "staging"\n');

        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {run: {handle() { return {count: 0}; }}},
        });
        const app = createApplication(
            defineApplication({
                components: [AComponent],
                config: schema({env: "string", port: "number"}),
            }),
            {base_dir, env: "staging"},
        );
        await app.start();

        assert.strictEqual(app.config.env, "staging");
        assert.strictEqual(app.config.port, 3000);

        await app.stop();
    });

    it("uses base config alone when env overlay file is missing", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}});
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) { return {count: context.config.initial}; },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir, env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 10});

        await app.stop();
    });

    it("uses base config alone when env is null", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 5\n');

        const CounterCalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}});
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) { return {count: context.config.initial}; },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir, env: null},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 5});

        await app.stop();
    });

    it("reloadConfig applies env overlay", async () => {
        await writeTestFile(join(base_dir, "counter", "config.toml"), 'initial = 10\n');
        await writeTestFile(join(base_dir, "counter", "config.prod.toml"), 'initial = 100\n');

        const CounterCalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}});
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            config: schema({initial: "number"}),
            handlers: {
                current: {
                    handle(context) { return {count: context.config.initial}; },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [CounterComponent]}),
            {base_dir, env: "prod"},
        );
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 100});

        await writeTestFile(join(base_dir, "counter", "config.prod.toml"), 'initial = 200\n');
        await app.reloadConfig();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 200});

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

    function createCapturingLogger(): {logger: Logger; warnings: string[]} {
        const warnings: string[] = [];
        const noop = () => {};
        const logger: Logger = {
            debug: noop,
            info: noop,
            warn(...args: unknown[]) { warnings.push(args.map(String).join(" ")); },
            error: noop,
        };
        return {logger, warnings};
    }

    it("provides validated secrets to component handlers", async () => {
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-123"\n');

        const VaultCalls = defineComponentCalls("vault", {
            get_key: {input: EmptyInput, output: schema({key: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({api_key: "string"}),
            handlers: {
                get_key: {
                    handle(context) {
                        return {key: context.secrets.api_key};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent]}),
            {base_dir},
        );
        await app.start();

        const result = await app.call(VaultCalls.calls.get_key, {});
        assert.deepStrictEqual(result, {key: "sk-123"});

        await app.stop();
    });

    it("does not provide secrets to components without a secrets schema", async () => {
        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: schema({has_secrets: "boolean"})}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: {
                    handle(context) {
                        return {has_secrets: "secrets" in context};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent]}),
            {base_dir},
        );
        await app.start();

        const result = await app.call(ACalls.calls.run, {});
        assert.deepStrictEqual(result, {has_secrets: false});

        await app.stop();
    });

    it("warns and uses empty defaults when secrets file is missing", async () => {
        const {logger, warnings} = createCapturingLogger();

        const VaultCalls = defineComponentCalls("vault", {
            get_key: {input: EmptyInput, output: schema({key: "string"})},
        });
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({"api_key?": "string"}),
            handlers: {
                get_key: {
                    handle(context) {
                        return {key: context.secrets.api_key ?? "none"};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({
                components: [VaultComponent],
                logger: () => logger,
            }),
            {base_dir},
        );
        await app.start();

        assert.ok(warnings.some((w) => w.includes("secrets")));
        const result = await app.call(VaultCalls.calls.get_key, {});
        assert.deepStrictEqual(result, {key: "none"});

        await app.stop();
    });

    it("exposes validated application secrets on the runtime", async () => {
        await writeTestFile(join(base_dir, "secrets.toml"), 'master_key = "mk-abc"\n');

        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {run: {handle() { return {count: 0}; }}},
        });
        const app = createApplication(
            defineApplication({
                components: [AComponent],
                secrets: schema({master_key: "string"}),
            }),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(app.secrets.master_key, "mk-abc");

        await app.stop();
    });

    it("makes secrets available in component start hooks", async () => {
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-start"\n');

        let start_secret: string | undefined;
        const VaultCalls = defineComponentCalls("vault", {run: {input: EmptyInput, output: CounterOutput}});
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({api_key: "string"}),
            start(context) {
                start_secret = context.secrets.api_key;
            },
            handlers: {
                run: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent]}),
            {base_dir},
        );
        await app.start();

        assert.strictEqual(start_secret, "sk-start");

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
                get: {
                    handle(context) {
                        return {api_key: context.secrets.api_key, db_pass: context.secrets.db_pass};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent]}),
            {base_dir, env: "prod"},
        );
        await app.start();

        const result = await app.call(VaultCalls.calls.get, {});
        assert.deepStrictEqual(result, {api_key: "sk-dev", db_pass: "prod-secret"});

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
                get: {
                    handle(context) {
                        return {key: context.secrets.api_key, label: context.config.label};
                    },
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent]}),
            {base_dir},
        );
        await app.start();

        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = "sk-changed"\n');
        await writeTestFile(join(base_dir, "vault", "config.toml"), 'label = "v2"\n');
        await app.reloadConfig();

        const result = await app.call(VaultCalls.calls.get, {});
        assert.strictEqual(result.key, "sk-original");
        assert.strictEqual(result.label, "v2");

        await app.stop();
    });

    it("throws SecretsValidationError when secrets fail schema validation", async () => {
        await writeTestFile(join(base_dir, "vault", "secrets.toml"), 'api_key = 42\n');

        const VaultCalls = defineComponentCalls("vault", {run: {input: EmptyInput, output: CounterOutput}});
        const VaultComponent = defineComponent({
            calls: VaultCalls,
            uses: [],
            secrets: schema({api_key: "string"}),
            handlers: {
                run: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(
            defineApplication({components: [VaultComponent]}),
            {base_dir},
        );

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof SecretsValidationError);
                return true;
            },
        );
    });
});
