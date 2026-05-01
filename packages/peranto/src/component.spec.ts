import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {type as schema} from "arktype";

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
}

void assertTypeBehavior;
