import assert from "node:assert/strict";
import {afterEach, describe, it, mock} from "node:test";

import {createRateLimiter} from "./rate-limiter.ts";

describe("@jiminp/stelaro rate limiter", () => {
    let current_time = 0;

    function advance(ms: number): void {
        current_time += ms;
    }

    afterEach(() => {
        current_time = 0;
        mock.restoreAll();
    });

    function useMockClock(): void {
        mock.method(performance, "now", () => current_time);
    }

    it("rejects an invalid limit or window", () => {
        for(const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.throws(() => createRateLimiter(limit, 1000), RangeError);
        }
        for(const window_ms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.throws(() => createRateLimiter(1, window_ms), RangeError);
        }
    });

    it("allows calls within the limit", () => {
        useMockClock();
        const limiter = createRateLimiter(3, 1000);

        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("a"), true);
    });

    it("rejects calls exceeding the limit", () => {
        useMockClock();
        const limiter = createRateLimiter(2, 1000);

        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("a"), false);
    });

    it("allows calls again once exactly window_ms has passed", () => {
        useMockClock();
        const limiter = createRateLimiter(1, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(99);
        assert.strictEqual(limiter.check("a"), false);
        advance(1);
        assert.strictEqual(limiter.check("a"), true);
    });

    it("tracks keys independently", () => {
        useMockClock();
        const limiter = createRateLimiter(1, 1000);

        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("b"), true);
        assert.strictEqual(limiter.check("a"), false);
        assert.strictEqual(limiter.check("b"), false);
    });

    it("uses a sliding window, not fixed buckets", () => {
        useMockClock();
        const limiter = createRateLimiter(2, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(60);
        assert.strictEqual(limiter.check("a"), true);

        // At t=60, both calls are within the 100ms window
        assert.strictEqual(limiter.check("a"), false);

        // At t=101, the first call (t=0) has expired, but the second (t=60) hasn't
        advance(41);
        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("a"), false);
    });

    it("keeps limiting active keys while other keys expire", () => {
        useMockClock();
        const limiter = createRateLimiter(1, 100);

        assert.strictEqual(limiter.check("a"), true);
        advance(50);
        assert.strictEqual(limiter.check("b"), true);
        advance(50);
        assert.strictEqual(limiter.check("c"), true);
        assert.strictEqual(limiter.check("b"), false);
        assert.strictEqual(limiter.check("a"), true);
    });
});
