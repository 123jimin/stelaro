import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {assertEqualType} from "@jiminp/tooltool";
import {type as schema} from "arktype";

import {
    type AnyComponent,
    type AnyComponentContext,
    type CallInput,
    type CallOutput,
    type ComponentContext,
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

describe("@jiminp/peranto component core", () => {
    it("defines component call references with stable public component ids and names", () => {
        const CounterCalls = defineComponentCalls({
            id: "counter",
            calls: {
                current: {
                    input: EmptyInput,
                    output: CounterOutput,
                },
            },
        });

        assert.deepStrictEqual(CounterCalls.calls.current.componentId, "counter");
        assert.deepStrictEqual(CounterCalls.calls.current.name, "current");
        assert.deepStrictEqual(CounterCalls.calls.current.input, EmptyInput);
        assert.deepStrictEqual(CounterCalls.calls.current.output, CounterOutput);
    });

    it("defines components from call surfaces, declared uses, and handlers", () => {
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
                            count: 0,
                        };
                    },
                },
            },
        });

        assert.deepStrictEqual(CounterComponent.calls, CounterCalls);
        assert.deepStrictEqual(CounterComponent.uses, []);
        assert.deepStrictEqual(typeof CounterComponent.handlers.current.handle, "function");
    });

    it("defines a component with an optional state factory", () => {
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
            },
        });

        assert.deepStrictEqual(typeof CounterComponent.state, "function");
        assert.deepStrictEqual(CounterComponent.state(), {count: 0});
    });

    it("defines a component without state", () => {
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
                            count: 0,
                        };
                    },
                },
            },
        });

        assert.deepStrictEqual("state" in CounterComponent, false);
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
    const PageCalls = defineComponentCalls({
        id: "page",
        calls: {
            render: {
                input: EmptyInput,
                output: RenderOutput,
            },
        },
    });

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

    void defineComponent({
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

    void defineComponent({
        calls: PageCalls,
        uses: [],
        handlers: {
            render: {
                async handle({call}) {
                    // @ts-expect-error component behavior can only call declared used call surfaces.
                    await call(CounterCalls.calls.current, {});

                    return {
                        html: "",
                    };
                },
            },
        },
    });

    void defineComponent({
        calls: CounterCalls,
        uses: [],
        state: () => ({
            count: 0,
        }),
        handlers: {
            current: {
                handle({state}) {
                    const count: number = state.count;

                    return {
                        count,
                    };
                },
            },
            set: {
                handle({state}, input) {
                    state.count = input.count;

                    return {
                        count: state.count,
                    };
                },
            },
        },
    });

    void defineComponent({
        calls: CounterCalls,
        uses: [],
        handlers: {
            current: {
                handle(context) {
                    // @ts-expect-error stateless components do not receive state in context.
                    void context.state;

                    return {
                        count: 0,
                    };
                },
            },
            set: {
                handle(_context, input) {
                    return {
                        count: input.count,
                    };
                },
            },
        },
    });

    // AnyComponentContext includes state as a known optional property.
    void ((_ctx: AnyComponentContext) => {
        const _state: unknown = _ctx.state;
        void _state;
    });

    // Stateful ComponentContext is assignable to AnyComponentContext.
    void ((_ctx: ComponentContext<[], {count: number}>) => {
        const _erased: AnyComponentContext = _ctx;
        void _erased;
    });

    // Stateless ComponentContext is assignable to AnyComponentContext.
    void ((_ctx: ComponentContext<[]>) => {
        const _erased: AnyComponentContext = _ctx;
        void _erased;
    });

    // Stateful component state is narrowed to the factory return type, not unknown.
    void defineComponent({
        calls: CounterCalls,
        uses: [],
        state: () => ({
            count: 0,
            label: "test",
        }),
        handlers: {
            current: {
                handle({state}) {
                    assertEqualType<typeof state, {count: number; label: string}>();

                    return {count: state.count};
                },
            },
            set: {
                handle({state}, input) {
                    state.count = input.count;
                    state.label = "updated";

                    return {count: state.count};
                },
            },
        },
    });

    // Stateful components are assignable to AnyComponent.
    const stateful_component = defineComponent({
        calls: CounterCalls,
        uses: [],
        state: () => ({count: 0}),
        handlers: {
            current: {
                handle({state}) {
                    return {count: state.count};
                },
            },
            set: {
                handle({state}, input) {
                    state.count = input.count;

                    return {count: state.count};
                },
            },
        },
    });
    const _stateful_any: AnyComponent = stateful_component;
    void _stateful_any;

    // Stateless components are assignable to AnyComponent.
    const stateless_component = defineComponent({
        calls: CounterCalls,
        uses: [],
        handlers: {
            current: {
                handle() {
                    return {count: 0};
                },
            },
            set: {
                handle(_context, input) {
                    return {count: input.count};
                },
            },
        },
    });
    const _stateless_any: AnyComponent = stateless_component;
    void _stateless_any;
}

void assertTypeBehavior;
