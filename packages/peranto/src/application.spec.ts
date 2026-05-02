import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {type as schema} from "arktype";

import {
    createApplication,
    defineApplication,
} from "./application.ts";
import {
    type CallInput,
    type CallOutput,
    defineComponent,
    defineComponentCalls,
} from "./component.ts";

const EmptyInput = schema({});
const CounterOutput = schema({
    count: "number",
});
const SetCounterInput = schema({
    count: "number",
});
const RenderOutput = schema({
    html: "string",
});

describe("@jiminp/peranto application core", () => {
    it("declares an application separately from creating the application runtime", () => {
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
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
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
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

    it("provides component behavior with context for declared typed calls", async () => {
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
            },
        });
        const PageCalls = defineComponentCalls({
            id: "page",
            calls: {
                render: {
                    input: EmptyInput,
                    output: RenderOutput,
                },
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

        assert.deepStrictEqual(await app.call(PageCalls.calls.render, {}), {
            html: "7",
        });
    });

    it("initializes component state from the state factory during createApplication", async () => {
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
                increment: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
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
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
                increment: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
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
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
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

        await app.call(CounterCalls.calls.current, {});
        assert.deepStrictEqual("state" in received_context, false);
    });

    it("does not share state between different components", async () => {
        const ACalls = defineComponentCalls({
            id: "a",
            calls: {
                get: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
                increment: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
            },
        });
        const BCalls = defineComponentCalls({
            id: "b",
            calls: {
                get: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
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

        await app.call(ACalls.calls.increment, {});

        assert.deepStrictEqual(await app.call(ACalls.calls.get, {}), {
            count: 1,
        });
        assert.deepStrictEqual(await app.call(BCalls.calls.get, {}), {
            count: 100,
        });
    });

    it("validates call inputs and outputs with the declared schemas", async () => {
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                set: {
                    input: SetCounterInput,
                    output: CounterOutput,
                },
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
});

function assertTypeBehavior() {
    const CounterCalls = defineComponentCalls({
        id: "counter",
        calls: {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
            set: {
                input: SetCounterInput,
                output: CounterOutput,
            },
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
