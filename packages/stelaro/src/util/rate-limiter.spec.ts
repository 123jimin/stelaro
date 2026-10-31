import assert from "node:assert/strict";
import {describe, it, type TestContext} from "node:test";
import {setTimeout} from "node:timers/promises";

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

    it("stops counting a call exactly `window_ms` after it was counted", (t) => {
        const advance = useFakeClock(t);
        const limiter = createRateLimiter(1, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(99);
        assert.strictEqual(limiter.check("a"), false);
        advance(1);
        assert.strictEqual(limiter.check("a"), true);
    });

    it("does not count rejected calls", (t) => {
        const advance = useFakeClock(t);
        const limiter = createRateLimiter(1, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(50);
        assert.strictEqual(limiter.check("a"), false);
        advance(50);
        assert.strictEqual(limiter.check("a"), true);
    });

    it("ignores wall-clock changes", async (t) => {
        const day_ms = 86_400_000;
        // Only `Date` is faked; the window elapses in real time.
        t.mock.timers.enable({apis: ["Date"], now: 10 * day_ms});
        const limiter = createRateLimiter(1, 50);

        assert.strictEqual(limiter.check("a"), true);
        t.mock.timers.setTime(11 * day_ms);
        assert.strictEqual(limiter.check("a"), false);
        t.mock.timers.setTime(9 * day_ms);
        await setTimeout(60);
        assert.strictEqual(limiter.check("a"), true);
    });

    it("throws RangeError unless limit is a positive integer and window_ms a positive finite number", () => {
        for(const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.throws(() => createRateLimiter(limit, 100), RangeError, `limit ${limit}`);
        }
        for(const window_ms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.throws(() => createRateLimiter(1, window_ms), RangeError, `window_ms ${window_ms}`);
        }
        assert.doesNotThrow(() => createRateLimiter(1, 0.5));
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
