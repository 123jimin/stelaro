import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {PLACEHOLDER} from "./index.ts";

describe("PLACEHOLDER", () => {
    it("should be equal to 42", () => {
        assert.strictEqual(PLACEHOLDER, 42);
    });
});
