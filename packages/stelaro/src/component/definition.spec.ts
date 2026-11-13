import {equal} from "node:assert/strict";
import {test} from "node:test";

import {assertEqualType} from "@jiminp/tooltool";
import {type} from "arktype";

import type {AnyComponent, DataAccess, Logger} from "../index.ts";
import {defineComponent, defineComponentCalls, EmptyInput} from "../index.ts";

test("component handlers and hooks infer capabilities and call schema directions", () => {
    const storage = defineComponentCalls("storage", {
        load: {input: type("string"), output: type({length: "number"})},
    });
    const _other = defineComponentCalls("other", {
        load: {input: type("string"), output: type({length: "number"})},
    });
    const calls = defineComponentCalls("worker", {
        count: {input: type("string").pipe((value) => value.length), output: type("number").pipe(String)},
        ready: {input: EmptyInput, output: type("boolean")},
    });
    const config = type({retry: "number"}).pipe(({retry}) => ({retry_count: retry}));
    const secrets = type({token: "string"});
    const component = defineComponent({
        calls,
        uses: [storage],
        state: () => ({jobs: 0}),
        config,
        secrets,
        start(_context) {
            assertEqualType<typeof _context.config, {retry_count: number}>();
            assertEqualType<typeof _context.state, {jobs: number}>();
        },
        async stop(_context) {
            assertEqualType<typeof _context.secrets, {token: string}>();
        },
        onConfigReload(_context) {
            assertEqualType<typeof _context.config, {retry_count: number}>();
            assertEqualType<typeof _context.log, Logger>();
        },
        handlers: {
            async count(context, input) {
                assertEqualType<typeof input, number>();
                assertEqualType<typeof context.state, {jobs: number}>();
                assertEqualType<typeof context.data, DataAccess>();
                assertEqualType<Parameters<typeof context.call>, [reference: typeof storage.calls.load, input: string]>();
                assertEqualType<typeof _other.calls.load extends Parameters<typeof context.call>[0] ? true : false, false>();
                const result = await context.call(storage.calls.load, context.secrets.token);
                assertEqualType<typeof result, {length: number}>();
                return input + result.length + context.config.retry_count;
            },
            ready: {
                handle(context) {
                    return context.state.jobs === 0;
                },
            },
        },
    });

    const registered: AnyComponent = component;
    assertEqualType<typeof component.uses, readonly [typeof storage]>();
    equal(registered.calls, calls);
    equal(component.config, config);
    equal(component.secrets, secrets);
});

test("component contexts expose only their declared capabilities", () => {
    const calls = defineComponentCalls("worker", {ready: {input: EmptyInput, output: type("boolean")}});
    defineComponent({
        calls,
        uses: [],
        handlers: {
            ready(_context) {
                assertEqualType<keyof typeof _context, "call" | "data" | "log">();
                assertEqualType<Parameters<typeof _context.call>[0], never>();
                return true;
            },
        },
    });
    defineComponent({
        calls,
        uses: [],
        handlers: {
            ready(context) {
                assertEqualType<keyof typeof context, "call" | "data" | "log" | "config" | "state">();
                assertEqualType<typeof context.state, {jobs: number}>();
                assertEqualType<typeof context.config, {ready: boolean}>();
                return context.config.ready;
            },
        },
        state: () => ({jobs: 0}),
        config: type({ready: "boolean"}),
    });
    defineComponent({
        calls,
        uses: [],
        secrets: type({token: "string"}),
        handlers: {
            ready(context) {
                assertEqualType<keyof typeof context, "call" | "data" | "log" | "secrets">();
                return context.secrets.token.length > 0;
            },
        },
    });
});

test("defining a component retains its declaration without running hooks or state factories", (t) => {
    const state = t.mock.fn(() => ({jobs: 0}));
    const start = t.mock.fn(() => Promise.resolve());
    const definition = {
        calls: defineComponentCalls("worker", {}),
        uses: [] as const,
        state,
        start,
        handlers: {},
    };

    equal(defineComponent(definition), definition);
    equal(state.mock.callCount(), 0);
    equal(start.mock.callCount(), 0);
});
