import {equal, throws} from "node:assert/strict";
import {test} from "node:test";

import {assertEqualType, identity} from "@jiminp/tooltool";
import {type} from "arktype";

import {defineLocalInput, defineLocalOutput, EmptyInput, isLocalSchema} from "../index.ts";

test("EmptyInput accepts only empty plain objects", () => {
    const empty = {};
    equal(EmptyInput.assert(empty), empty);
    const empty_without_prototype: unknown = Object.create(null);
    equal(EmptyInput.assert(empty_without_prototype), empty_without_prototype);

    const with_hidden_key = Object.defineProperty({}, "hidden", {value: true});
    const with_hidden_symbol = Object.defineProperty({}, Symbol("hidden"), {value: true});
    for(const value of [{key: true}, with_hidden_symbol, null, 0]) {
        throws(() => EmptyInput.assert(value));
    }
    for(const value of [[], with_hidden_key, new Date()]) {
        throws(() => EmptyInput.assert(value), /a plain object with no own properties, such as \{\}/u);
    }
});

test("local input and output schemas retain their types and pass through values by identity", () => {
    const input = defineLocalInput<() => number>();
    const output = defineLocalOutput<{jobs: number}>();
    const count = () => 2;
    const result = {jobs: 2};

    assertEqualType<typeof input.inferIn, () => number>();
    assertEqualType<typeof input.infer, () => number>();
    assertEqualType<typeof output.inferIn, {jobs: number}>();
    assertEqualType<typeof output.infer, {jobs: number}>();
    equal(input.assert(count), count);
    equal(output.assert(result), result);
    equal(isLocalSchema(input), true);
    equal(isLocalSchema(output), true);
    equal(isLocalSchema(EmptyInput), false);
    equal(isLocalSchema(type("unknown")), false);

    const inherited = {inferIn: null, infer: null, assert: identity};
    Object.setPrototypeOf(inherited, input);
    equal(isLocalSchema(inherited), false);
});
