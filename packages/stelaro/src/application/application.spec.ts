import assert from "node:assert/strict";
import {join, resolve} from "node:path";
import {describe, it} from "node:test";

import type {Promisable} from "@jiminp/tooltool";
import {TraversalError} from "arktype";

import {parseArgs} from "../cli/args.ts";
import {defineComponent, defineComponentCalls} from "../component/component.ts";
import type {AnyComponentContext} from "../component/context.ts";
import type {Logger} from "../component/logger.ts";
import type {CallInput, CallOutput} from "../component/types.ts";
import {
    CounterOutput,
    defineCounterCalls,
    defineCounterComponent,
    EmptyInput,
    noopLoggerFactory,
    RenderOutput,
    SetCounterInput,
} from "../test-util.ts";
import {createApplication, defineApplication} from "./application.ts";
import {
    CircularDependencyError,
    DuplicateComponentIdError,
    MissingDependencyError,
    MissingHandlerError,
    UndeclaredCallError,
    UnregisteredCallError,
} from "./error.ts";
import {type LifecycleState, LifecycleStateError} from "./lifecycle.ts";

type LoggerMethodName = "debug" | "info" | "warn" | "error";

const logger_method_names = ["debug", "info", "warn", "error"] as const satisfies readonly LoggerMethodName[];

function recordHooks(events: string[], id: string): {start: () => void; stop: () => void} {
    return {
        start: () => { events.push(`start ${id}`); },
        stop: () => { events.push(`stop ${id}`); },
    };
}

describe("@jiminp/stelaro application core", () => {
    it("dispatches object-form and callable-form handlers", async () => {
        let count = 0;
        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
            increment: {input: EmptyInput, output: CounterOutput},
            set: {input: SetCounterInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current: {
                    handle() {
                        return {count};
                    },
                },
                async increment() {
                    count += 1;
                    return {count};
                },
                set: (_context, input) => {
                    count = input.count;
                    return {count};
                },
            },
        });
        const app = createApplication(defineApplication({components: [CounterComponent], logger: noopLoggerFactory}));
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 0});
        assert.deepStrictEqual(await app.call(CounterCalls.calls.increment, {}), {count: 1});
        assert.deepStrictEqual(await app.call(CounterCalls.calls.set, {count: 5}), {count: 5});
        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 5});
    });

    it("lets a handler call a declared dependency through its context", async () => {
        const CounterCalls = defineCounterCalls("counter");
        const PageCalls = defineComponentCalls("page", {
            render: {input: EmptyInput, output: RenderOutput},
        });
        const PageComponent = defineComponent({
            calls: PageCalls,
            uses: [CounterCalls],
            handlers: {
                async render({call}) {
                    const {count} = await call(CounterCalls.calls.current, {});
                    return {html: String(count)};
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(CounterCalls), PageComponent],
            logger: noopLoggerFactory,
        }));
        await app.start();
        await app.call(CounterCalls.calls.increment, {});

        assert.deepStrictEqual(await app.call(PageCalls.calls.render, {}), {html: "1"});
    });

    it("gives each component the logger its factory created for the component id", async () => {
        const created = new Map<string, Logger>();
        const received = new Map<string, Logger>();
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {get({log}) { received.set("a", log); return {count: 0}; }},
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            handlers: {get({log}) { received.set("b", log); return {count: 0}; }},
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
            logger(scope) {
                const log = {...noopLoggerFactory(scope)};
                created.set(scope, log);
                return log;
            },
        }));
        await app.start();
        await app.call(ACalls.calls.get, {});
        await app.call(BCalls.calls.get, {});

        assert.strictEqual(received.get("a"), created.get("a"));
        assert.strictEqual(received.get("b"), created.get("b"));
    });

    it("uses a component-scoped default console logger when no logger factory is provided", async () => {
        const console_calls: Record<LoggerMethodName, unknown[][]> = {debug: [], info: [], warn: [], error: []};
        const original_console_methods: Record<LoggerMethodName, typeof console.debug> = {
            debug: console.debug,
            info: console.info,
            warn: console.warn,
            error: console.error,
        };
        const structured_data = {count: 1};
        const extra_data = ["extra"];
        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current({log}) {
                    log.debug("debug message", structured_data, extra_data);
                    log.info("info message", structured_data, extra_data);
                    log.warn("warn message", structured_data, extra_data);
                    log.error("error message", structured_data, extra_data);
                    return {count: 1};
                },
            },
        });

        try {
            for(const method of logger_method_names) {
                console[method] = (...args: unknown[]) => {
                    console_calls[method].push(args);
                };
            }

            const app = createApplication(defineApplication({components: [CounterComponent]}));
            await app.start();
            await app.call(CounterCalls.calls.current, {});
        } finally {
            for(const method of logger_method_names) {
                console[method] = original_console_methods[method];
            }
        }

        for(const method of logger_method_names) {
            const handler_call = console_calls[method].find((args) => args[1] === `${method} message`);
            assert.ok(handler_call, `expected a ${method} call from the handler`);
            assert.match(String(handler_call[0]), /^\[counter\]/);
            assert.deepStrictEqual(handler_call.slice(2), [structured_data, extra_data]);
        }
    });

    it("creates component state once at createApplication and keeps it across restarts", async () => {
        let factory_calls = 0;
        const CounterCalls = defineCounterCalls("counter");
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            state: () => {
                factory_calls += 1;
                return {count: 0};
            },
            handlers: {
                current: ({state}) => ({count: state.count}),
                increment: ({state}) => {
                    state.count += 1;
                    return {count: state.count};
                },
            },
        });
        const app = createApplication(defineApplication({components: [CounterComponent], logger: noopLoggerFactory}));
        assert.strictEqual(factory_calls, 1);

        await app.start();
        await app.call(CounterCalls.calls.increment, {});
        await app.stop();
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 1});
        assert.strictEqual(factory_calls, 1);
    });

    it("provides independent state per application runtime for the same component definition", async () => {
        const CounterCalls = defineCounterCalls("counter");
        const definition = defineApplication({components: [defineCounterComponent(CounterCalls)], logger: noopLoggerFactory});
        const app1 = createApplication(definition);
        const app2 = createApplication(definition);
        await app1.start();
        await app2.start();

        await app1.call(CounterCalls.calls.increment, {});
        await app1.call(CounterCalls.calls.increment, {});

        assert.deepStrictEqual(await app1.call(CounterCalls.calls.current, {}), {count: 2});
        assert.deepStrictEqual(await app2.call(CounterCalls.calls.current, {}), {count: 0});
    });

    it("does not provide state to stateless components", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        let has_state: boolean | null = null;
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current(context) {
                    has_state = "state" in context;
                    return {count: 0};
                },
            },
        });
        const app = createApplication(defineApplication({components: [CounterComponent], logger: noopLoggerFactory}));
        await app.start();
        await app.call(CounterCalls.calls.current, {});

        assert.strictEqual(has_state, false);
    });

    it("does not share state between different components", async () => {
        const ACalls = defineCounterCalls("a");
        const BCalls = defineCounterCalls("b");
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(ACalls), defineCounterComponent(BCalls)],
            logger: noopLoggerFactory,
        }));
        await app.start();

        await app.call(ACalls.calls.increment, {});

        assert.deepStrictEqual(await app.call(ACalls.calls.current, {}), {count: 1});
        assert.deepStrictEqual(await app.call(BCalls.calls.current, {}), {count: 0});
    });

    it("validates call inputs before dispatch and outputs after it", async () => {
        let handled = 0;
        const CounterCalls = defineComponentCalls("counter", {
            set: {input: SetCounterInput, output: CounterOutput},
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                set() {
                    handled += 1;
                    return {count: "invalid"} as unknown as {count: number};
                },
            },
        });
        const app = createApplication(defineApplication({components: [CounterComponent], logger: noopLoggerFactory}));
        await app.start();

        await assert.rejects(
            () => app.call(CounterCalls.calls.set, {} as unknown as CallInput<typeof CounterCalls.calls.set>),
            TraversalError,
        );
        assert.strictEqual(handled, 0);

        await assert.rejects(() => app.call(CounterCalls.calls.set, {count: 1}), TraversalError);
        assert.strictEqual(handled, 1);
    });

    it("throws MissingDependencyError when a component uses unregistered calls", () => {
        const AComponent = defineCounterComponent(defineCounterCalls("a"), {uses: [defineCounterCalls("b")]});

        assert.throws(
            () => createApplication(defineApplication({components: [AComponent]})),
            MissingDependencyError,
        );
    });

    it("throws MissingHandlerError when a component is missing a handler", () => {
        const ACalls = defineComponentCalls("a", {
            run: {input: EmptyInput, output: CounterOutput},
            missing: {input: EmptyInput, output: CounterOutput},
        });
        const partial_handlers = {
            run: () => ({count: 0}),
        };
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: partial_handlers as typeof partial_handlers & {missing: () => {count: number}},
        });

        assert.throws(
            () => createApplication(defineApplication({components: [AComponent]})),
            MissingHandlerError,
        );
    });

    it("throws DuplicateComponentIdError when components share the same id", () => {
        assert.throws(
            () => createApplication(defineApplication({
                components: [
                    defineCounterComponent(defineCounterCalls("shared")),
                    defineCounterComponent(defineCounterCalls("shared")),
                ],
            })),
            (error: unknown) => {
                assert.ok(error instanceof DuplicateComponentIdError);
                assert.strictEqual(error.component_id, "shared");
                return true;
            },
        );
    });

    it("throws UndeclaredCallError when a handler calls an undeclared reference", async () => {
        const ACalls = defineComponentCalls("a", {
            run: {input: EmptyInput, output: CounterOutput},
        });
        const BCalls = defineCounterCalls("b");
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                async run(context) {
                    await (context as unknown as AnyComponentContext).call(BCalls.calls.current, {});
                    return {count: 0};
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, defineCounterComponent(BCalls)],
            logger: noopLoggerFactory,
        }));
        await app.start();

        await assert.rejects(() => app.call(ACalls.calls.run, {}), UndeclaredCallError);
    });

    it("throws UnregisteredCallError when dispatching an unregistered call", async () => {
        const UnregisteredCalls = defineCounterCalls("unregistered");
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(defineCounterCalls("registered"))],
            logger: noopLoggerFactory,
        }));
        await app.start();

        await assert.rejects(
            () => (app as unknown as {call(ref: unknown, input: unknown): Promise<unknown>})
                .call(UnregisteredCalls.calls.current, {}),
            UnregisteredCallError,
        );
    });

    it("starts components in dependency order and stops them in reverse order", async () => {
        const events: string[] = [];
        const ACalls = defineCounterCalls("a");
        const BCalls = defineCounterCalls("b");
        const app = createApplication(defineApplication({
            components: [
                defineCounterComponent(ACalls, {uses: [BCalls], ...recordHooks(events, "a")}),
                defineCounterComponent(BCalls, recordHooks(events, "b")),
            ],
            logger: noopLoggerFactory,
        }));

        await app.start();
        await app.stop();

        assert.deepStrictEqual(events, ["start b", "start a", "stop a", "stop b"]);
    });

    it("reports only the components on the cycle in CircularDependencyError", () => {
        const ACalls = defineCounterCalls("a");
        const BCalls = defineCounterCalls("b");
        const CCalls = defineCounterCalls("c");

        assert.throws(
            () => createApplication(defineApplication({
                components: [
                    defineCounterComponent(ACalls, {uses: [BCalls]}),
                    defineCounterComponent(BCalls, {uses: [ACalls]}),
                    defineCounterComponent(CCalls, {uses: [ACalls]}),
                ],
            })),
            (error: unknown) => {
                assert.ok(error instanceof CircularDependencyError);
                assert.deepStrictEqual([...error.component_ids].sort(), ["a", "b"]);
                return true;
            },
        );
    });

    it("gives lifecycle hooks the same state and logger as handlers", async () => {
        const seen: {readonly state: object; readonly log: Logger; readonly data_dir: string}[] = [];
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            state: () => ({count: 42}),
            start({state, log, data}) {
                seen.push({state, log, data_dir: data.dir});
            },
            stop({state, log, data}) {
                seen.push({state, log, data_dir: data.dir});
            },
            handlers: {
                get({state, log, data}) {
                    seen.push({state, log, data_dir: data.dir});
                    return {count: state.count};
                },
            },
        });
        const app = createApplication(defineApplication({components: [AComponent], logger: noopLoggerFactory}));

        await app.start();
        await app.call(ACalls.calls.get, {});
        await app.stop();

        assert.strictEqual(seen.length, 3);
        for(const key of ["state", "log", "data_dir"] as const) {
            assert.strictEqual(new Set(seen.map((capabilities) => capabilities[key])).size, 1, key);
        }
    });

    it("starts, dispatches to, and stops a component without lifecycle hooks", async () => {
        const events: string[] = [];
        const ACalls = defineCounterCalls("a");
        const BCalls = defineCounterCalls("b");
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(ACalls, recordHooks(events, "a")), defineCounterComponent(BCalls)],
            logger: noopLoggerFactory,
        }));

        await app.start();
        assert.deepStrictEqual(await app.call(BCalls.calls.increment, {}), {count: 1});
        await app.stop();

        assert.deepStrictEqual(events, ["start a", "stop a"]);
    });

    it("leaves later components unstarted after a start failure and stops only active ones", async () => {
        const events: string[] = [];
        const start_error = new Error("b failed to start");
        const ACalls = defineCounterCalls("a");
        const BCalls = defineCounterCalls("b");
        const CCalls = defineCounterCalls("c");
        const b_hooks = recordHooks(events, "b");
        const app = createApplication(defineApplication({
            components: [
                defineCounterComponent(ACalls, recordHooks(events, "a")),
                defineCounterComponent(BCalls, {
                    start: () => {
                        b_hooks.start();
                        throw start_error;
                    },
                    stop: b_hooks.stop,
                }),
                defineCounterComponent(CCalls, recordHooks(events, "c")),
            ],
            logger: noopLoggerFactory,
        }));

        await assert.rejects(app.start(), (error) => error === start_error);
        assert.deepStrictEqual(events, ["start a", "start b"]);
        await assert.rejects(app.call(ACalls.calls.current, {}), LifecycleStateError);

        await app.stop();
        assert.deepStrictEqual(events, ["start a", "start b", "stop a"]);

        await assert.rejects(app.start(), (error) => error === start_error);
    });

    it("collects every stop hook failure into an AggregateError and still reaches idle", async () => {
        const events: string[] = [];
        const a_error = new Error("a stop failed");
        const b_error = new Error("b stop failed");
        const ACalls = defineCounterCalls("a");
        const BCalls = defineCounterCalls("b");
        const app = createApplication(defineApplication({
            components: [
                defineCounterComponent(ACalls, {stop: () => { events.push("stop a"); throw a_error; }}),
                defineCounterComponent(BCalls, {stop: () => { events.push("stop b"); throw b_error; }}),
            ],
            logger: noopLoggerFactory,
        }));
        await app.start();

        await assert.rejects(app.stop(), (error: unknown) => {
            assert.ok(error instanceof AggregateError);
            assert.strictEqual(error.errors.length, 2);
            assert.ok(error.errors.includes(a_error));
            assert.ok(error.errors.includes(b_error));
            return true;
        });
        assert.deepStrictEqual(events, ["stop b", "stop a"]);

        await app.start();
    });

    it("counts a stop hook rejecting with a nullish value as a failure", async () => {
        const ACalls = defineCounterCalls("a");
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(ACalls, {stop: () => Promise.reject(null)})],
            logger: noopLoggerFactory,
        }));
        await app.start();

        await assert.rejects(app.stop(), (error: unknown) => {
            assert.ok(error instanceof AggregateError);
            assert.deepStrictEqual(error.errors, [null]);
            return true;
        });
    });

    it("allows calls from onConfigReload hooks while reloading", async () => {
        let reloaded_count: number | null = null;
        const CounterCalls = defineCounterCalls("counter");
        const WatcherCalls = defineComponentCalls("watcher", {
            current: {input: EmptyInput, output: CounterOutput},
        });
        const WatcherComponent = defineComponent({
            calls: WatcherCalls,
            uses: [CounterCalls],
            async onConfigReload({call}) {
                reloaded_count = (await call(CounterCalls.calls.current, {})).count;
            },
            handlers: {
                current: () => ({count: 0}),
            },
        });
        const app = createApplication(defineApplication({
            components: [defineCounterComponent(CounterCalls), WatcherComponent],
            logger: noopLoggerFactory,
        }));
        await app.start();
        await app.call(CounterCalls.calls.increment, {});

        await app.reloadConfig();

        assert.strictEqual(reloaded_count, 1);
    });

    it("roots application and component data access under the resolved base directory", async () => {
        let component_data_dir: string | null = null;
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get({data}) {
                    component_data_dir = data.dir;
                    return {count: 0};
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [AComponent], logger: noopLoggerFactory}),
            {base_dir: "test-base"},
        );
        await app.start();
        await app.call(ACalls.calls.get, {});

        const base_dir = resolve("test-base");
        assert.strictEqual(app.data.dir, join(base_dir, "data"));
        assert.strictEqual(component_data_dir, join(base_dir, "a", "data"));
    });
});

type Operation = "start" | "stop" | "call" | "reloadConfig";

const invalid_operations: readonly (readonly [Exclude<LifecycleState, "reloading">, readonly Operation[]])[] = [
    ["idle", ["stop", "call", "reloadConfig"]],
    ["starting", ["start", "stop", "call", "reloadConfig"]],
    ["active", ["start"]],
    ["failed", ["start", "call", "reloadConfig"]],
    ["stopping", ["start", "stop", "call", "reloadConfig"]],
];

async function enterState(state: Exclude<LifecycleState, "reloading">) {
    const CounterCalls = defineCounterCalls("counter");
    let startHook = (): Promisable<void> => {};
    let stopHook = (): Promisable<void> => {};
    const app = createApplication(defineApplication({
        components: [defineCounterComponent(CounterCalls, {start: () => startHook(), stop: () => stopHook()})],
        logger: noopLoggerFactory,
    }));
    const operations: Record<Operation, () => Promise<unknown>> = {
        start: () => app.start(),
        stop: () => app.stop(),
        call: () => app.call(CounterCalls.calls.current, {}),
        reloadConfig: () => app.reloadConfig(),
    };

    let settle = async (): Promise<void> => {};
    switch(state) {
        case "idle":
            break;
        case "active":
            await app.start();
            settle = () => app.stop();
            break;
        case "failed":
            startHook = () => { throw new Error("start failed"); };
            await assert.rejects(app.start());
            settle = () => app.stop();
            break;
        case "starting": {
            const gate = Promise.withResolvers<void>();
            startHook = () => gate.promise;
            const starting = app.start();
            settle = async () => {
                gate.resolve();
                await starting;
                await app.stop();
            };
            break;
        }
        case "stopping": {
            await app.start();
            const gate = Promise.withResolvers<void>();
            stopHook = () => gate.promise;
            const stopping = app.stop();
            settle = async () => {
                gate.resolve();
                await stopping;
            };
            break;
        }
    }

    return {operations, settle};
}

describe("@jiminp/stelaro application lifecycle guards", () => {
    for(const [state, operations] of invalid_operations) {
        for(const operation of operations) {
            it(`rejects ${operation} while ${state} with LifecycleStateError`, async () => {
                const entered = await enterState(state);

                await assert.rejects(entered.operations[operation], (error: unknown) => {
                    assert.ok(error instanceof LifecycleStateError);
                    assert.strictEqual(error.current_state, state);
                    assert.strictEqual(error.operation, operation);
                    return true;
                });

                await entered.settle();
            });
        }
    }
});

function assertTypeBehavior() {
    const CounterCalls = defineComponentCalls("counter", {
        current: {input: EmptyInput, output: CounterOutput},
        set: {input: SetCounterInput, output: CounterOutput},
    });
    const CounterComponent = defineComponent({
        calls: CounterCalls,
        uses: [],
        handlers: {
            current: () => ({count: 0}),
            set(_context, input) {
                const count: number = input.count;
                return {count};
            },
        },
    });
    const CounterApp = defineApplication({components: [CounterComponent]});
    const app = createApplication(CounterApp);

    type CurrentInput = CallInput<typeof CounterCalls.calls.current>;
    type SetInput = CallInput<typeof CounterCalls.calls.set>;
    type CurrentOutput = CallOutput<typeof CounterCalls.calls.current>;

    const current_input: CurrentInput = {};
    const set_input: SetInput = {count: 1};
    const current_output: CurrentOutput = {count: 1};

    void current_input;
    void set_input;
    void current_output;
    void app.call(CounterCalls.calls.current, {});
    void app.call(CounterCalls.calls.set, {count: 1});

    // @ts-expect-error `counter.set` requires `{count: number}` input.
    void app.call(CounterCalls.calls.set, {});

    const string_reference = "counter.current";

    // @ts-expect-error user code calls references, not string keys.
    void app.call(string_reference, {});

    // CLI arguments are accepted as application options.
    void createApplication(CounterApp, parseArgs([]));
}

void assertTypeBehavior;
