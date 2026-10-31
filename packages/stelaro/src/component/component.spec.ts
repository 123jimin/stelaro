import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {assertEqualType} from "@jiminp/tooltool";
import {type} from "arktype";

import {createApplication, defineApplication} from "../application/application.ts";
import {DuplicateCallError} from "../application/error.ts";
import {InvalidComponentIdError, MismatchedComponentIdError} from "../error.ts";
import {defineLocalInput, defineLocalOutput, EmptyInput} from "../schema.ts";
import {
    CounterOutput,
    noopLoggerFactory,
    RenderOutput,
    SetCounterInput,
} from "../test-util.ts";
import {defineComponent, defineComponentCalls, mergeComponentCalls} from "./component.ts";
import type {AnyComponentContext, ComponentContext} from "./context.ts";
import type {AnyComponent, CallInput, CallOutput} from "./types.ts";

const ParsedInput = type({value: "string.numeric.parse"});
const DefaultedOutput = type({count: "number = 0"});

describe("@jiminp/stelaro component core", () => {
    it("defines call references that carry their component id, call name, and schemas", () => {
        const CounterCalls = defineComponentCalls("counter", {
            current: {
                input: EmptyInput,
                output: CounterOutput,
            },
        });

        assert.deepStrictEqual(CounterCalls.calls.current.component_id, "counter");
        assert.deepStrictEqual(CounterCalls.calls.current.name, "current");
        assert.deepStrictEqual(CounterCalls.calls.current.input, EmptyInput);
        assert.deepStrictEqual(CounterCalls.calls.current.output, CounterOutput);
    });

    it("accepts lowercase kebab-case component ids", () => {
        for(const id of ["a", "users", "http-gateway", "auth-v2", "a1b"]) {
            const calls = defineComponentCalls(id, {
                run: {input: EmptyInput, output: CounterOutput},
            });
            assert.strictEqual(calls.id, id);
        }
    });

    it("throws InvalidComponentIdError for non-kebab-case component ids", () => {
        for(const id of ["", "A", "Users", "my_component", "foo-", "-foo", "foo--bar", "FOO", "a b", " a", "a\n", "a.b", "a/b", "a\\b", "../a", "a/../b"]) {
            assert.throws(
                () => defineComponentCalls(id, {
                    run: {input: EmptyInput, output: CounterOutput},
                }),
                (error: unknown) => {
                    assert.ok(error instanceof InvalidComponentIdError);
                    assert.strictEqual(error.component_id, id);
                    return true;
                },
            );
        }
    });

    it("merges call surfaces of one component, keeping their call references", () => {
        const PublicCalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}});
        const InternalCalls = defineComponentCalls("counter", {set: {input: SetCounterInput, output: CounterOutput}});
        const AdminCalls = defineComponentCalls("counter", {reset: {input: EmptyInput, output: CounterOutput}});
        const CounterCalls = mergeComponentCalls(PublicCalls, InternalCalls, AdminCalls);

        assert.strictEqual(CounterCalls.id, "counter");
        assert.strictEqual(CounterCalls.calls.current, PublicCalls.calls.current);
        assert.strictEqual(CounterCalls.calls.set, InternalCalls.calls.set);
        assert.strictEqual(CounterCalls.calls.reset, AdminCalls.calls.reset);
        assert.deepStrictEqual(new Set(Object.keys(CounterCalls.calls)), new Set(["current", "set", "reset"]));
        assertEqualType<CallInput<typeof CounterCalls.calls.set>, {count: number}>();
        assert.deepStrictEqual(mergeComponentCalls(PublicCalls), {id: "counter", calls: PublicCalls.calls});
    });

    it("refuses to merge call surfaces of different components", () => {
        const ACalls = defineComponentCalls("a", {run: {input: EmptyInput, output: CounterOutput}});
        const A2Calls = defineComponentCalls("a", {stop: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("b", {stop: {input: EmptyInput, output: CounterOutput}});
        assert.throws(
            // @ts-expect-error -- the ids differ at the type level too
            () => mergeComponentCalls(ACalls, A2Calls, BCalls),
            (error: unknown) => {
                assert.ok(error instanceof MismatchedComponentIdError);
                assert.deepStrictEqual([error.component_id, error.other_component_id], ["a", "b"]);
                return true;
            },
        );
    });

    it("refuses to merge call surfaces that declare the same call name", () => {
        const ACalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}, increment: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("counter", {set: {input: SetCounterInput, output: CounterOutput}});
        const CCalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}, set: {input: SetCounterInput, output: CounterOutput}});
        assert.throws(
            () => mergeComponentCalls(ACalls, BCalls, CCalls),
            (error: unknown) => {
                assert.ok(error instanceof DuplicateCallError);
                assert.deepStrictEqual(new Set(error.duplicate_keys), new Set(["counter.current", "counter.set"]));
                return true;
            },
        );
    });

    it("merges call surfaces whose call names match Object.prototype members", () => {
        const ACalls = defineComponentCalls("counter", {current: {input: EmptyInput, output: CounterOutput}});
        const BCalls = defineComponentCalls("counter", {
            toString: {input: EmptyInput, output: CounterOutput},
            constructor: {input: EmptyInput, output: CounterOutput},
            hasOwnProperty: {input: EmptyInput, output: CounterOutput},
        });
        const CounterCalls = mergeComponentCalls(ACalls, BCalls);

        assert.deepStrictEqual(new Set(Object.keys(CounterCalls.calls)), new Set(["current", "toString", "constructor", "hasOwnProperty"]));
        assert.strictEqual(CounterCalls.calls.toString, BCalls.calls.toString);

        const CCalls = defineComponentCalls("counter", {toString: {input: EmptyInput, output: CounterOutput}});
        assert.throws(
            () => mergeComponentCalls(ACalls, BCalls, CCalls),
            (error: unknown) => {
                assert.ok(error instanceof DuplicateCallError);
                assert.deepStrictEqual(new Set(error.duplicate_keys), new Set(["counter.toString"]));
                return true;
            },
        );
    });

    it("passes validated input to handlers and validates their output for callers", async () => {
        const ParseCalls = defineComponentCalls("parse", {
            run: {input: ParsedInput, output: DefaultedOutput},
        });
        let received: unknown = null;
        const ParseComponent = defineComponent({
            calls: ParseCalls,
            uses: [],
            handlers: {
                run(_context, input) {
                    received = input;
                    return {};
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [ParseComponent], logger: noopLoggerFactory}),
        );
        await app.start();

        assert.deepStrictEqual(await app.call(ParseCalls.calls.run, {value: "42"}), {count: 0});
        assert.deepStrictEqual(received, {value: 42});

        await app.stop();
    });

    it("passes local values through unchecked in both directions", async () => {
        type Listener = (event: string) => void;
        type Subscription = {close(): void};
        const LocalCalls = defineComponentCalls("local", {
            subscribe: {input: defineLocalInput<Listener>(), output: defineLocalOutput<Subscription>()},
        });
        let received: unknown = null;
        let reply: Subscription = {close() {}};
        const LocalComponent = defineComponent({
            calls: LocalCalls,
            uses: [],
            handlers: {
                subscribe(_context, listener) {
                    received = listener;
                    return reply;
                },
            },
        });
        const app = createApplication(
            defineApplication({components: [LocalComponent], logger: noopLoggerFactory}),
        );
        await app.start();

        const listener: Listener = () => {};
        assert.strictEqual(await app.call(LocalCalls.calls.subscribe, listener), reply);
        assert.strictEqual(received, listener);

        // Values the declared types would reject still pass.
        const not_a_listener = 42 as unknown as Listener;
        reply = "not a subscription" as unknown as Subscription;
        assert.strictEqual(await app.call(LocalCalls.calls.subscribe, not_a_listener), reply);
        assert.strictEqual(received, not_a_listener);

        await app.stop();
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
    const PageCalls = defineComponentCalls("page", {
        render: {
            input: EmptyInput,
            output: RenderOutput,
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

    const ParseCalls = defineComponentCalls("parse", {
        run: {input: ParsedInput, output: DefaultedOutput},
    });

    // Callers pass pre-validation input and receive validated output.
    assertEqualType<CallInput<typeof ParseCalls.calls.run>, {value: string}>();
    assertEqualType<CallOutput<typeof ParseCalls.calls.run>, {count: number}>();

    // Handlers receive validated input and may return pre-validation output.
    void defineComponent({
        calls: ParseCalls,
        uses: [],
        handlers: {
            run(_context, _input) {
                assertEqualType<typeof _input, {value: number}>();

                return {};
            },
        },
    });

    // `call` checks input and infers output for declared `uses` surfaces.
    void defineComponent({
        calls: PageCalls,
        uses: [CounterCalls, ParseCalls],
        handlers: {
            render: {
                async handle({call}) {
                    const _counter = await call(CounterCalls.calls.set, {count: 1});
                    assertEqualType<typeof _counter, {count: number}>();

                    const _parsed = await call(ParseCalls.calls.run, {value: "1"});
                    assertEqualType<typeof _parsed, {count: number}>();

                    // @ts-expect-error call input is checked against the input schema.
                    await call(CounterCalls.calls.set, {count: "1"});

                    return {html: ""};
                },
            },
        },
    });

    // Local schemas type values as `T` for callers and handlers.
    const LocalCalls = defineComponentCalls("local", {
        run: {input: defineLocalInput<(event: string) => void>(), output: defineLocalOutput<Map<string, number>>()},
    });
    assertEqualType<CallInput<typeof LocalCalls.calls.run>, (event: string) => void>();
    assertEqualType<CallOutput<typeof LocalCalls.calls.run>, Map<string, number>>();
    void defineComponent({
        calls: LocalCalls,
        uses: [],
        handlers: {
            run(_context, _input) {
                assertEqualType<typeof _input, (event: string) => void>();

                return new Map<string, number>();
            },
        },
    });
    void defineComponent({
        calls: LocalCalls,
        uses: [],
        handlers: {
            // @ts-expect-error a handler must return the local output's type.
            run: () => "not a map",
        },
    });

    // Declared config and secrets are typed from their schemas.
    void defineComponent({
        calls: PageCalls,
        uses: [],
        config: type({port: "number"}),
        secrets: type({api_key: "string"}),
        handlers: {
            render(_context) {
                assertEqualType<typeof _context.config, {port: number}>();
                assertEqualType<typeof _context.secrets, {api_key: string}>();

                return {html: ""};
            },
        },
    });

    // Undeclared config and secrets are absent.
    void defineComponent({
        calls: PageCalls,
        uses: [],
        handlers: {
            render(context) {
                // @ts-expect-error components without a config schema do not receive config.
                void context.config;
                // @ts-expect-error components without a secrets schema do not receive secrets.
                void context.secrets;

                return {html: ""};
            },
        },
    });

    // Every call in the surface needs exactly one handler.
    void defineComponent({
        calls: CounterCalls,
        uses: [],
        // @ts-expect-error the `set` handler is missing.
        handlers: {
            current: () => ({count: 0}),
        },
    });
    void defineComponent({
        calls: PageCalls,
        uses: [],
        handlers: {
            render: () => ({html: ""}),
            // @ts-expect-error `extra` is not a call in the surface.
            extra: () => ({html: ""}),
        },
    });
}

void assertTypeBehavior;
