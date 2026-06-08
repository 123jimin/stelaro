import assert from "node:assert/strict";
import {join, resolve} from "node:path";
import {describe, it} from "node:test";

import {
    type AnyComponentContext,
    type CallInput,
    type CallOutput,
    defineComponent,
    defineComponentCalls,
} from "../component/component.ts";
import type {Logger} from "../component/logger.ts";
import {StelaroError} from "../error.ts";
import {
    CounterOutput,
    EmptyInput,
    RenderOutput,
    SetCounterInput,
} from "../test-util.ts";
import {
    createApplication,
    defineApplication,
    FRAMEWORK_NAME,
} from "./application.ts";
import {
    CircularDependencyError,
    DuplicateComponentIdError,
    MissingDependencyError,
    MissingHandlerError,
    UndeclaredCallError,
    UnregisteredCallError,
} from "./error.ts";
import {LifecycleStateError} from "./lifecycle.ts";

type LoggerMethodName = "debug" | "info" | "warn" | "error";

const logger_method_names = ["debug", "info", "warn", "error"] as const satisfies readonly LoggerMethodName[];

describe("@jiminp/stelaro application core", () => {
    it("declares an application separately from creating the application runtime", () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current: {
                    handle() {
                        return {
                            count: 1,
                        };
                    },
                },
            },
        });

        const CounterApp = defineApplication({
            components: [
                CounterComponent,
            ],
        });
        const app = createApplication(CounterApp);

        assert.deepStrictEqual(CounterApp.components, [CounterComponent]);
        assert.deepStrictEqual(typeof app.call, "function");
    });

    it("dispatches typed component calls within one application", async () => {
        let count = 0;
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
            increment: {
                input: EmptyInput,
                output: CounterOutput,
            },
            set: {
                input: SetCounterInput,
                output: CounterOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current: {
                    handle() {
                        return {
                            count,
                        };
                    },
                },
                increment: {
                    async handle() {
                        count += 1;

                        return {
                            count,
                        };
                    },
                },
                set: {
                    handle(_context, input) {
                        count = input.count;

                        return {
                            count,
                        };
                    },
                },
            },
        });
        const CounterApp = defineApplication({
            components: [
                CounterComponent,
            ],
        });
        const app = createApplication(CounterApp);
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {
            count: 0,
        });
        assert.deepStrictEqual(await app.call(CounterCalls.calls.increment, {}), {
            count: 1,
        });
        assert.deepStrictEqual(await app.call(CounterCalls.calls.set, {
            count: 5,
        }), {
            count: 5,
        });
    });

    it("dispatches a handler written as a bare callable identically to the object form", async () => {
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
        const app = createApplication(defineApplication({components: [CounterComponent]}));
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 0});
        assert.deepStrictEqual(await app.call(CounterCalls.calls.increment, {}), {count: 1});
        assert.deepStrictEqual(await app.call(CounterCalls.calls.set, {count: 5}), {count: 5});
        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {count: 5});
    });

    it("provides component behavior with context for declared typed calls", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const PageCalls = defineComponentCalls("page", {
            render: {
                input: EmptyInput,
                output: RenderOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current: {
                    handle() {
                        return {
                            count: 7,
                        };
                    },
                },
            },
        });
        const PageComponent = defineComponent({
            calls: PageCalls,
            uses: [
                CounterCalls,
            ],
            handlers: {
                render: {
                    async handle({call}) {
                        const {count: current_count} = await call(
                            CounterCalls.calls.current,
                            {},
                        );

                        return {
                            html: String(current_count),
                        };
                    },
                },
            },
        });
        const CounterPageApp = defineApplication({
            components: [
                CounterComponent,
                PageComponent,
            ],
        });
        const app = createApplication(CounterPageApp);
        await app.start();

        assert.deepStrictEqual(await app.call(PageCalls.calls.render, {}), {
            html: "7",
        });
    });

    it("provides component-scoped logging to handlers and lifecycle hooks", async () => {
        const observed_log_methods: LoggerMethodName[][] = [];
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            start({log}) {
                observed_log_methods.push(loggerMethodNames(log));
            },
            stop({log}) {
                observed_log_methods.push(loggerMethodNames(log));
            },
            handlers: {
                current: {
                    handle({log}) {
                        observed_log_methods.push(loggerMethodNames(log));

                        return {
                            count: 0,
                        };
                    },
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [CounterComponent],
        }));

        await app.start();
        await app.call(CounterCalls.calls.current, {});
        await app.stop();

        assert.deepStrictEqual(observed_log_methods, [
            ["debug", "info", "warn", "error"],
            ["debug", "info", "warn", "error"],
            ["debug", "info", "warn", "error"],
        ]);
    });

    it("creates component-scoped loggers with the configured logger factory", async () => {
        const factory_component_ids: string[] = [];
        const logger_by_component_id = new Map<string, Logger>();
        const received_logger_by_component_id = new Map<string, Logger>();
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const PageCalls = defineComponentCalls("page", {
            render: {
                input: EmptyInput,
                output: RenderOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current: {
                    handle({log}) {
                        received_logger_by_component_id.set("counter", log);

                        return {
                            count: 3,
                        };
                    },
                },
            },
        });
        const PageComponent = defineComponent({
            calls: PageCalls,
            uses: [],
            handlers: {
                render: {
                    handle({log}) {
                        received_logger_by_component_id.set("page", log);

                        return {
                            html: "ok",
                        };
                    },
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [CounterComponent, PageComponent],
            logger(component_id) {
                factory_component_ids.push(component_id);

                const logger = createRecordingLogger();
                logger_by_component_id.set(component_id, logger);

                return logger;
            },
        }));
        await app.start();

        await app.call(CounterCalls.calls.current, {});
        await app.call(PageCalls.calls.render, {});

        assert.deepStrictEqual(new Set(factory_component_ids), new Set([FRAMEWORK_NAME, "counter", "page"]));
        assert.deepStrictEqual(factory_component_ids.length, 3);
        assert.deepStrictEqual(
            received_logger_by_component_id.get("counter"),
            logger_by_component_id.get("counter"),
        );
        assert.deepStrictEqual(
            received_logger_by_component_id.get("page"),
            logger_by_component_id.get("page"),
        );
    });

    it("uses a component-scoped default console logger when no logger factory is provided", async () => {
        const console_calls: Record<LoggerMethodName, unknown[][]> = {
            debug: [],
            info: [],
            warn: [],
            error: [],
        };
        const original_console_methods: Record<LoggerMethodName, typeof console.debug> = {
            debug: console.debug,
            info: console.info,
            warn: console.warn,
            error: console.error,
        };
        const structured_data = {
            count: 1,
        };
        const extra_data = ["extra"];
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current: {
                    handle({log}) {
                        log.debug("debug message", structured_data, extra_data);
                        log.info("info message", structured_data, extra_data);
                        log.warn("warn message", structured_data, extra_data);
                        log.error("error message", structured_data, extra_data);

                        return {
                            count: 1,
                        };
                    },
                },
            },
        });

        try {
            for(const method of logger_method_names) {
                setConsoleMethod(method, (...args: unknown[]) => {
                    console_calls[method].push(args);
                });
            }

            const app = createApplication(defineApplication({
                components: [CounterComponent],
            }));
            await app.start();
            await app.call(CounterCalls.calls.current, {});
        } finally {
            for(const method of logger_method_names) {
                setConsoleMethod(method, original_console_methods[method]);
            }
        }

        for(const method of logger_method_names) {
            const method_calls = console_calls[method];

            // Lifecycle logging now also routes through the default console logger, so locate the
            // handler's own record (its message is the argument after the [id] prefix) rather than
            // assuming it is the only call.
            const handler_call = method_calls.find((args) => args[1] === `${method} message`);
            assert.ok(handler_call, `expected a ${method} call from the handler`);

            const [message, data] = handler_call;

            assert.deepStrictEqual(typeof message, "string");
            const message_text = message as string;

            assert.match(message_text, /^\[counter\]/);
            assert.deepStrictEqual(data, `${method} message`);
            assert.deepStrictEqual(handler_call[2], structured_data);
            assert.deepStrictEqual(handler_call[3], extra_data);
        }
    });

    it("initializes component state from the state factory during createApplication", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
            increment: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            state: () => ({
                count: 0,
            }),
            handlers: {
                current: {
                    handle({state}) {
                        return {
                            count: state.count,
                        };
                    },
                },
                increment: {
                    handle({state}) {
                        state.count += 1;

                        return {
                            count: state.count,
                        };
                    },
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [CounterComponent],
        }));
        await app.start();

        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {
            count: 0,
        });
        assert.deepStrictEqual(await app.call(CounterCalls.calls.increment, {}), {
            count: 1,
        });
        assert.deepStrictEqual(await app.call(CounterCalls.calls.increment, {}), {
            count: 2,
        });
        assert.deepStrictEqual(await app.call(CounterCalls.calls.current, {}), {
            count: 2,
        });
    });

    it("provides independent state per application runtime for the same component definition", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
            increment: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            state: () => ({
                count: 0,
            }),
            handlers: {
                current: {
                    handle({state}) {
                        return {
                            count: state.count,
                        };
                    },
                },
                increment: {
                    handle({state}) {
                        state.count += 1;

                        return {
                            count: state.count,
                        };
                    },
                },
            },
        });
        const definition = defineApplication({
            components: [CounterComponent],
        });
        const app1 = createApplication(definition);
        const app2 = createApplication(definition);
        await app1.start();
        await app2.start();

        await app1.call(CounterCalls.calls.increment, {});
        await app1.call(CounterCalls.calls.increment, {});

        assert.deepStrictEqual(await app1.call(CounterCalls.calls.current, {}), {
            count: 2,
        });
        assert.deepStrictEqual(await app2.call(CounterCalls.calls.current, {}), {
            count: 0,
        });
    });

    it("does not provide state to stateless components", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        let received_context: Record<string, unknown> = {};
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                current: {
                    handle(context) {
                        received_context = context as unknown as Record<string, unknown>;

                        return {
                            count: 0,
                        };
                    },
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [CounterComponent],
        }));
        await app.start();

        await app.call(CounterCalls.calls.current, {});
        assert.deepStrictEqual("state" in received_context, false);
    });

    it("does not share state between different components", async () => {
        const ACalls = defineComponentCalls("a", {
            get: {
                input: EmptyInput,
                output: CounterOutput,
            },
            increment: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const BCalls = defineComponentCalls("b", {
            get: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            state: () => ({count: 0}),
            handlers: {
                get: {
                    handle({state}) {
                        return {count: state.count};
                    },
                },
                increment: {
                    handle({state}) {
                        state.count += 1;

                        return {count: state.count};
                    },
                },
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            state: () => ({count: 100}),
            handlers: {
                get: {
                    handle({state}) {
                        return {count: state.count};
                    },
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }));
        await app.start();

        await app.call(ACalls.calls.increment, {});

        assert.deepStrictEqual(await app.call(ACalls.calls.get, {}), {
            count: 1,
        });
        assert.deepStrictEqual(await app.call(BCalls.calls.get, {}), {
            count: 100,
        });
    });

    it("validates call inputs and outputs with the declared schemas", async () => {
        const CounterCalls = defineComponentCalls("counter", {
            set: {
                input: SetCounterInput,
                output: CounterOutput,
            },
        });
        const CounterComponent = defineComponent({
            calls: CounterCalls,
            uses: [],
            handlers: {
                set: {
                    handle() {
                        return {
                            count: "invalid",
                        } as unknown as {
                            count: number;
                        };
                    },
                },
            },
        });
        const CounterApp = defineApplication({
            components: [
                CounterComponent,
            ],
        });
        const app = createApplication(CounterApp);
        await app.start();

        await assert.rejects(
            () => app.call(
                CounterCalls.calls.set,
                {} as unknown as CallInput<typeof CounterCalls.calls.set>,
            ),
            /count/,
        );
        await assert.rejects(
            () => app.call(CounterCalls.calls.set, {
                count: 1,
            }),
            /count/,
        );
    });

    it("throws MissingDependencyError when a component uses unregistered calls", () => {
        const ACalls = defineComponentCalls("a", {
            run: {input: EmptyInput, output: CounterOutput},
        });
        const BCalls = defineComponentCalls("b", {
            get: {input: EmptyInput, output: CounterOutput},
        });
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [BCalls],
            handlers: {
                run: {
                    handle() {
                        return {count: 0};
                    },
                },
            },
        });

        assert.throws(
            () => createApplication(defineApplication({
                components: [AComponent],
            })),
            MissingDependencyError,
        );
    });

    it("throws MissingHandlerError when a component is missing a handler", () => {
        const ACalls = defineComponentCalls("a", {
            run: {input: EmptyInput, output: CounterOutput},
            missing: {input: EmptyInput, output: CounterOutput},
        });
        const partial_handlers = {
            run: {
                handle() {
                    return {count: 0};
                },
            },
        };
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: partial_handlers as typeof partial_handlers & {
                missing: {handle(): {count: number}};
            },
        });

        assert.throws(
            () => createApplication(defineApplication({
                components: [AComponent],
            })),
            MissingHandlerError,
        );
    });

    it("throws DuplicateComponentIdError when components share the same id", () => {
        const Calls = defineComponentCalls("shared", {
            get: {input: EmptyInput, output: CounterOutput},
        });
        const A = defineComponent({
            calls: Calls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const B = defineComponent({
            calls: Calls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 1}; }},
            },
        });

        assert.throws(
            () => createApplication(defineApplication({
                components: [A, B],
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
        const BCalls = defineComponentCalls("b", {
            get: {input: EmptyInput, output: CounterOutput},
        });
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                run: {
                    async handle(context) {
                        await (context as unknown as AnyComponentContext)
                            .call(BCalls.calls.get, {});

                        return {count: 0};
                    },
                },
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            handlers: {
                get: {
                    handle() {
                        return {count: 0};
                    },
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }));
        await app.start();

        await assert.rejects(
            () => app.call(ACalls.calls.run, {}),
            UndeclaredCallError,
        );
    });

    it("throws UnregisteredCallError when dispatching an unregistered call", async () => {
        const RegisteredCalls = defineComponentCalls("registered", {
            get: {input: EmptyInput, output: CounterOutput},
        });
        const UnregisteredCalls = defineComponentCalls("unregistered", {
            get: {input: EmptyInput, output: CounterOutput},
        });
        const RegisteredComponent = defineComponent({
            calls: RegisteredCalls,
            uses: [],
            handlers: {
                get: {
                    handle() {
                        return {count: 0};
                    },
                },
            },
        });
        const app = createApplication(defineApplication({
            components: [RegisteredComponent],
        }));
        await app.start();

        await assert.rejects(
            () => (app as unknown as {call(ref: unknown, input: unknown): Promise<unknown>})
                .call(UnregisteredCalls.calls.get, {}),
            UnregisteredCallError,
        );
    });

    it("starts components in topological dependency order", async () => {
        const start_order: string[] = [];
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [BCalls],
            start() {
                start_order.push("a");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            start() {
                start_order.push("b");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }));

        await app.start();

        assert.deepStrictEqual(start_order, ["b", "a"]);
    });

    it("stops components in reverse topological order", async () => {
        const stop_order: string[] = [];
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [BCalls],
            stop() {
                stop_order.push("a");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            stop() {
                stop_order.push("b");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }));
        await app.start();

        await app.stop();

        assert.deepStrictEqual(stop_order, ["a", "b"]);
    });

    it("throws CircularDependencyError when the uses graph has a cycle", () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [BCalls],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [ACalls],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });

        assert.throws(
            () => createApplication(defineApplication({
                components: [AComponent, BComponent],
            })),
            (error: unknown) => {
                assert.ok(error instanceof CircularDependencyError);
                assert.ok(error.component_ids.includes("a"));
                assert.ok(error.component_ids.includes("b"));
                return true;
            },
        );
    });

    it("throws LifecycleStateError when calling before start", async () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent],
        }));

        await assert.rejects(
            () => app.call(ACalls.calls.get, {}),
            (error: unknown) => {
                assert.ok(error instanceof LifecycleStateError);
                assert.deepStrictEqual(error.current_state, "idle");
                assert.deepStrictEqual(error.operation, "call");
                return true;
            },
        );
    });

    it("throws LifecycleStateError when calling after stop", async () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent],
        }));
        await app.start();
        await app.stop();

        await assert.rejects(
            () => app.call(ACalls.calls.get, {}),
            (error: unknown) => {
                assert.ok(error instanceof LifecycleStateError);
                assert.deepStrictEqual(error.current_state, "idle");
                return true;
            },
        );
    });

    it("throws LifecycleStateError when starting a non-idle application", async () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent],
        }));
        await app.start();

        await assert.rejects(
            () => app.start(),
            (error: unknown) => {
                assert.ok(error instanceof LifecycleStateError);
                assert.deepStrictEqual(error.current_state, "active");
                assert.deepStrictEqual(error.operation, "start");
                return true;
            },
        );
    });

    it("throws LifecycleStateError when stopping an idle application", async () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent],
        }));

        await assert.rejects(
            () => app.stop(),
            (error: unknown) => {
                assert.ok(error instanceof LifecycleStateError);
                assert.deepStrictEqual(error.current_state, "idle");
                assert.deepStrictEqual(error.operation, "stop");
                return true;
            },
        );
    });

    it("provides lifecycle hooks with the same context as handlers", async () => {
        let start_state: {count: number} | null = null;
        let stop_state: {count: number} | null = null;
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            state: () => ({count: 42}),
            start({state}) {
                start_state = state;
            },
            stop({state}) {
                stop_state = state;
            },
            handlers: {
                get: {handle({state}) { return {count: state.count}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent],
        }));

        await app.start();
        assert.deepStrictEqual(start_state, {count: 42});

        await app.stop();
        assert.deepStrictEqual(stop_state, {count: 42});
    });

    it("skips components without lifecycle hooks", async () => {
        const start_order: string[] = [];
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            start() {
                start_order.push("a");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }));

        await app.start();

        assert.deepStrictEqual(start_order, ["a"]);
    });

    it("transitions to failed on start hook error without rolling back", async () => {
        const stop_calls: string[] = [];
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            start() {
                // succeeds
            },
            stop() {
                stop_calls.push("a");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            start() {
                throw new Error("b failed to start");
            },
            stop() {
                stop_calls.push("b");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }));

        await assert.rejects(
            () => app.start(),
            {message: "b failed to start"},
        );
        assert.deepStrictEqual(stop_calls, []);

        await assert.rejects(
            () => app.call(ACalls.calls.get, {}),
            LifecycleStateError,
        );

        await app.stop();
        assert.deepStrictEqual(stop_calls, ["a"]);
    });

    it("rejects stop with AggregateError when stop hooks throw", async () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            stop() {
                throw new Error("a stop failed");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            stop() {
                throw new Error("b stop failed");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }));
        await app.start();

        await assert.rejects(
            () => app.stop(),
            (error: unknown) => {
                assert.ok(error instanceof AggregateError);
                assert.deepStrictEqual(error.errors.length, 2);
                return true;
            },
        );
    });

    it("transitions to idle after stop even when stop hooks throw", async () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            stop() {
                throw new Error("stop failed");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent],
        }));
        await app.start();

        await assert.rejects(() => app.stop(), AggregateError);

        await app.start();
        assert.deepStrictEqual(await app.call(ACalls.calls.get, {}), {count: 0});
    });

    it("allows stop from failed state to clean up", async () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            start() {
                throw new Error("start failed");
            },
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const app = createApplication(defineApplication({
            components: [AComponent],
        }));

        await assert.rejects(() => app.start());

        await app.stop();

        // app is back to idle — start is valid again
        await assert.rejects(
            () => app.start(),
            {message: "start failed"},
        );
    });

    it("exposes application-level data access rooted at base_dir/data", () => {
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get: {handle() { return {count: 0}; }},
            },
        });
        const base_dir = resolve("test-base");
        const app = createApplication(defineApplication({
            components: [AComponent],
        }), {base_dir});

        assert.strictEqual(app.data.dir, join(base_dir, "data"));
        assert.strictEqual(
            app.data.resolve("templates"),
            join(base_dir, "data", "templates"),
        );
    });

    it("provides component-scoped data access in context", async () => {
        let received_dir = "";
        let received_resolved = "";
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get: {
                    handle({data}) {
                        received_dir = data.dir;
                        received_resolved = data.resolve("file.txt");
                        return {count: 0};
                    },
                },
            },
        });
        const base_dir = resolve("test-base");
        const app = createApplication(defineApplication({
            components: [AComponent],
        }), {base_dir});
        await app.start();
        await app.call(ACalls.calls.get, {});

        assert.strictEqual(received_dir, join(base_dir, "a", "data"));
        assert.strictEqual(received_resolved, join(base_dir, "a", "data", "file.txt"));
    });

    it("provides different data directories per component", async () => {
        const received_dirs: Record<string, string> = {};
        const ACalls = defineComponentCalls("a", {get: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {get: {input: EmptyInput, output: CounterOutput}});
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [],
            handlers: {
                get: {
                    handle({data}) {
                        received_dirs["a"] = data.dir;
                        return {count: 0};
                    },
                },
            },
        });
        const BComponent = defineComponent({
            calls: BCalls,
            uses: [],
            handlers: {
                get: {
                    handle({data}) {
                        received_dirs["b"] = data.dir;
                        return {count: 0};
                    },
                },
            },
        });
        const base_dir = resolve("test-base");
        const app = createApplication(defineApplication({
            components: [AComponent, BComponent],
        }), {base_dir});
        await app.start();
        await app.call(ACalls.calls.get, {});
        await app.call(BCalls.calls.get, {});

        assert.strictEqual(received_dirs["a"], join(base_dir, "a", "data"));
        assert.strictEqual(received_dirs["b"], join(base_dir, "b", "data"));
        assert.notStrictEqual(received_dirs["a"], received_dirs["b"]);
    });

    it("throws errors that are instanceof StelaroError", () => {
        const ACalls = defineComponentCalls("a", {
            run: {input: EmptyInput, output: CounterOutput},
        });
        const BCalls = defineComponentCalls("b", {
            get: {input: EmptyInput, output: CounterOutput},
        });
        const AComponent = defineComponent({
            calls: ACalls,
            uses: [BCalls],
            handlers: {
                run: {
                    handle() {
                        return {count: 0};
                    },
                },
            },
        });

        try {
            createApplication(defineApplication({
                components: [AComponent],
            }));
            assert.fail("Expected StelaroError");
        } catch (error) {
            assert.ok(error instanceof StelaroError);
            assert.ok(error instanceof Error);
        }
    });
});

function assertTypeBehavior() {
    const CounterCalls = defineComponentCalls("counter", {
        current: {
            input: EmptyInput,
            output: CounterOutput,
        },
        set: {
            input: SetCounterInput,
            output: CounterOutput,
        },
    });
    const CounterComponent = defineComponent({
        calls: CounterCalls,
        uses: [],
        handlers: {
            current: {
                handle() {
                    return {
                        count: 0,
                    };
                },
            },
            set: {
                handle(_context, input) {
                    const count: number = input.count;

                    return {
                        count,
                    };
                },
            },
        },
    });
    const CounterApp = defineApplication({
        components: [
            CounterComponent,
        ],
    });
    const app = createApplication(CounterApp);

    type CurrentInput = CallInput<typeof CounterCalls.calls.current>;
    type SetInput = CallInput<typeof CounterCalls.calls.set>;
    type CurrentOutput = CallOutput<typeof CounterCalls.calls.current>;

    const current_input: CurrentInput = {};
    const set_input: SetInput = {
        count: 1,
    };
    const current_output: CurrentOutput = {
        count: 1,
    };

    void current_input;
    void set_input;
    void current_output;
    void app.call(CounterCalls.calls.current, {});
    void app.call(CounterCalls.calls.set, {
        count: 1,
    });

    // @ts-expect-error `counter.set` requires `{count: number}` input.
    void app.call(CounterCalls.calls.set, {});

    const string_reference = "counter.current";

    // @ts-expect-error user code calls references, not string keys.
    void app.call(string_reference, {});
}

void assertTypeBehavior;

function loggerMethodNames(log: Logger): LoggerMethodName[] {
    return logger_method_names.filter((method) => typeof log[method] === "function");
}

function createRecordingLogger(): Logger {
    return {
        debug() {
            // Test logger intentionally records nothing.
        },
        info() {
            // Test logger intentionally records nothing.
        },
        warn() {
            // Test logger intentionally records nothing.
        },
        error() {
            // Test logger intentionally records nothing.
        },
    };
}

function setConsoleMethod(method: LoggerMethodName, value: typeof console.debug): void {
    switch(method) {
        case "debug":
            console.debug = value;
            return;
        case "info":
            console.info = value;
            return;
        case "warn":
            console.warn = value;
            return;
        case "error":
            console.error = value;
            return;
    }
}
