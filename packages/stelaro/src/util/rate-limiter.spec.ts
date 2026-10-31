import assert from "node:assert/strict";
import {describe, it, type TestContext} from "node:test";

import {createRateLimiter} from "./rate-limiter.ts";

/** Fakes both `Date.now` and `performance.now` from one clock and returns a function that advances it. */
function useFakeClock(t: TestContext): (ms: number) => void {
    t.mock.timers.enable({apis: ["Date"], now: 1_000_000});
    t.mock.method(performance, "now", () => Date.now());
    return (ms) => {
        t.mock.timers.tick(ms);
    };
}

describe("@jiminp/stelaro rate limiter", () => {
    it("allows calls up to the limit and rejects the next one within the window", (t) => {
        useFakeClock(t);
        const limiter = createRateLimiter(3, 1000);
        assert.deepStrictEqual([1, 2, 3, 4].map(() => limiter.check("a")), [true, true, true, false]);
    });

    it("allows calls again once the window has passed", (t) => {
        const advance = useFakeClock(t);
        const limiter = createRateLimiter(1, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(99);
        assert.strictEqual(limiter.check("a"), false);
        advance(2);
        assert.strictEqual(limiter.check("a"), true);
    });

    it("tracks keys independently", (t) => {
        useFakeClock(t);
        const limiter = createRateLimiter(1, 1000);

        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("b"), true);
        assert.strictEqual(limiter.check(""), true);
        assert.strictEqual(limiter.check("a"), false);
        assert.strictEqual(limiter.check("b"), false);
        assert.strictEqual(limiter.check(""), false);
    });

    it("uses a sliding window, not fixed buckets", (t) => {
        const advance = useFakeClock(t);
        const limiter = createRateLimiter(2, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(60);
        assert.strictEqual(limiter.check("a"), true);

        // The call at t=0 has left the window; the call at t=60 has not.
        advance(41);
        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("a"), false);
    });

    it("keeps limiting active keys while other keys expire", (t) => {
        const advance = useFakeClock(t);
        const limiter = createRateLimiter(1, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(50);
        assert.strictEqual(limiter.check("b"), true);
        advance(51);
        assert.strictEqual(limiter.check("c"), true);
        assert.strictEqual(limiter.check("b"), false);
        assert.strictEqual(limiter.check("a"), true);
    });
});
