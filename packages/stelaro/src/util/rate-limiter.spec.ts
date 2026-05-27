import assert from "node:assert/strict";
import {afterEach, describe, it, mock} from "node:test";

import {createRateLimiter} from "./rate-limiter.ts";

describe("@jiminp/stelaro rate limiter", () => {
    let current_time = 0;

    function advance(ms: number): void {
        current_time += ms;
    }

    const original_now = performance.now;

    afterEach(() => {
        current_time = 0;
        mock.restoreAll();
    });

    function useMockClock(): void {
        mock.method(performance, "now", () => current_time);
    }

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

    it("allows calls again after the window expires", () => {
        useMockClock();
        const limiter = createRateLimiter(1, 100);

        assert.strictEqual(limiter.check("a"), true);
        assert.strictEqual(limiter.check("a"), false);

        advance(101);

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
    });

    it("prunes expired entries on check", () => {
        useMockClock();
        const limiter = createRateLimiter(1, 50);

        limiter.check("a");
        advance(51);
        limiter.check("a");
        advance(51);

        assert.strictEqual(limiter.check("a"), true);
    });
});
