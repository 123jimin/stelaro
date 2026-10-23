import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {TraversalError} from "arktype";

import {EmptyInput} from "./schema.ts";

describe("EmptyInput", () => {
    it("accepts only `{}`", () => {
        assert.deepStrictEqual(EmptyInput.assert({}), {});
        for(const input of [{key: 1}, [], null, "", 0, new Date(0), () => ({})]) {
            assert.throws(() => EmptyInput.assert(input), TraversalError, String(input));
        }
    });
});
