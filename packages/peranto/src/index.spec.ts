import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import * as peranto from "./index.ts";

describe("@jiminp/peranto placeholder", () => {
    it("exposes no runtime API before t0003 implementation", () => {
        assert.deepStrictEqual(Object.keys(peranto), []);
    });
});
