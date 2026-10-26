import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {TraversalError, type as schema} from "arktype";

import {defineLocalInput, defineLocalOutput, EmptyInput, isLocalSchema} from "./schema.ts";

describe("EmptyInput", () => {
    it("accepts only `{}`", () => {
        assert.deepStrictEqual(EmptyInput.assert({}), {});
        for(const input of [{key: 1}, [], null, "", 0, new Date(0), () => ({})]) {
            assert.throws(() => EmptyInput.assert(input), TraversalError, String(input));
        }
    });
});

describe("isLocalSchema", () => {
    it("recognizes only schemas from defineLocalInput and defineLocalOutput", () => {
        assert.strictEqual(isLocalSchema(defineLocalInput<unknown>()), true);
        assert.strictEqual(isLocalSchema(defineLocalOutput<unknown>()), true);
        assert.strictEqual(isLocalSchema(EmptyInput), false);
        assert.strictEqual(isLocalSchema(schema("unknown")), false);
    });
});
