import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
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
import {StelaroError} from "../error.ts";
import {ConfigFileError, ConfigValidationError} from "./error.ts";

const EmptyInput = schema({});
const CounterOutput = schema({count: "number"});

describe("@jiminp/stelaro configuration", () => {
    let base_dir: string;

    beforeEach(async () => {
        base_dir = await mkdtemp(join(tmpdir(), "stelaro-config-"));
    });

    afterEach(async () => {
        await rm(base_dir, {recursive: true});
    });

    async function writeConfig(file_path: string, content: string): Promise<void> {
        await mkdir(dirname(file_path), {recursive: true});
        await writeFile(file_path, content);
    }

    it("provides validated config to component handlers after start", async () => {
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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
        const ACalls = defineComponentCalls({
            id: "a",
            calls: {
                run: {input: EmptyInput, output: schema({has_config: "boolean"})},
            },
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
        await writeConfig(join(base_dir, "config.toml"), 'env = "dev"\n');

        const ACalls = defineComponentCalls({
            id: "a",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
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
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 42\n');

        let start_config_value: number | undefined;
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = "not a number"\n');

        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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

        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 99\n');
        await app.reloadConfig();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 99});

        await app.stop();
    });

    it("rejects reloadConfig on validation failure and preserves old config", async () => {
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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

        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = "bad"\n');
        await assert.rejects(() => app.reloadConfig(), ConfigValidationError);

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 10});

        await app.stop();
    });

    it("calls onConfigReload hooks in topological order", async () => {
        await writeConfig(join(base_dir, "a", "config.toml"), 'value = 1\n');
        await writeConfig(join(base_dir, "b", "config.toml"), 'value = 2\n');

        const reload_order: string[] = [];

        const ACalls = defineComponentCalls({
            id: "a",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
        const BCalls = defineComponentCalls({
            id: "b",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            config: schema({value: "number"}),
            onConfigReload() {
                reload_order.push("a");
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
                reload_order.push("b");
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

        await writeConfig(join(base_dir, "a", "config.toml"), 'value = 10\n');
        await writeConfig(join(base_dir, "b", "config.toml"), 'value = 20\n');
        await app.reloadConfig();

        assert.deepStrictEqual(reload_order, ["a", "b"]);

        await app.stop();
    });

    it("throws LifecycleStateError when reloadConfig is called outside active state", async () => {
        const ACalls = defineComponentCalls({
            id: "a",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
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
        await writeConfig(join(base_dir, "a", "config.toml"), 'value = 1\n');
        await writeConfig(join(base_dir, "b", "config.toml"), 'value = 2\n');

        const ACalls = defineComponentCalls({
            id: "a",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
        const BCalls = defineComponentCalls({
            id: "b",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
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

        await writeConfig(join(base_dir, "a", "config.toml"), 'value = 99\n');
        await app.reloadComponentConfig("a");

        assert.deepStrictEqual(await app.call(ACalls.calls.run, {}), {count: 99});
        assert.deepStrictEqual(await app.call(BCalls.calls.run, {}), {count: 2});

        await app.stop();
    });

    it("calls only the target component onConfigReload hook for reloadComponentConfig", async () => {
        await writeConfig(join(base_dir, "a", "config.toml"), 'value = 1\n');
        await writeConfig(join(base_dir, "b", "config.toml"), 'value = 2\n');

        const reload_calls: string[] = [];

        const ACalls = defineComponentCalls({
            id: "a",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
        const BCalls = defineComponentCalls({
            id: "b",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
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

        await writeConfig(join(base_dir, "a", "config.toml"), 'value = 99\n');
        await app.reloadComponentConfig("a");

        assert.deepStrictEqual(reload_calls, ["a"]);

        await app.stop();
    });

    it("rejects reloadComponentConfig on validation failure and preserves old config", async () => {
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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

        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = "bad"\n');
        await assert.rejects(() => app.reloadComponentConfig("counter"), ConfigValidationError);

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 10});

        await app.stop();
    });

    it("throws LifecycleStateError when reloadComponentConfig is called outside active state", async () => {
        const ACalls = defineComponentCalls({
            id: "a",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
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
        const ACalls = defineComponentCalls({
            id: "a",
            calls: {run: {input: EmptyInput, output: CounterOutput}},
        });
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

    it("transitions to failed when onConfigReload hook throws", async () => {
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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

        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 99\n');
        await assert.rejects(() => app.reloadConfig());

        await assert.rejects(() => app.reloadConfig(), LifecycleStateError);
    });

    it("calls application onConfigReload hook after all component hooks", async () => {
        await writeConfig(join(base_dir, "config.toml"), 'env = "dev"\n');
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 10\n');

        const hook_order: string[] = [];

        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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

        await writeConfig(join(base_dir, "config.toml"), 'env = "prod"\n');
        await writeConfig(join(base_dir, "counter", "config.toml"), 'initial = 99\n');
        await app.reloadConfig();

        assert.deepStrictEqual(hook_order, ["component", "application"]);

        await app.stop();
    });

    it("config errors extend StelaroError", async () => {
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {input: EmptyInput, output: CounterOutput},
            },
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
