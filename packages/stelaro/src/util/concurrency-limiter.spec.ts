import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createConcurrencyLimiter} from "./concurrency-limiter.ts";

/** Resolves after pending promise callbacks have run, with whether `promise` settled by then. */
function isSettled(promise: Promise<unknown>): Promise<boolean> {
    let settled = false;
    const markSettled = () => {
        settled = true;
    };
    promise.then(markSettled, markSettled);
    const {promise: checked, resolve} = Promise.withResolvers<boolean>();
    setImmediate(() => { resolve(settled); });
    return checked;
}

describe("@jiminp/stelaro concurrency limiter", () => {
    it("holds an acquire at capacity until a slot is released", async () => {
        const limiter = createConcurrencyLimiter(1);

        const release1 = await limiter.acquire("a");
        const pending = limiter.acquire("a");
        assert.strictEqual(await isSettled(pending), false);

        release1();
        const release2 = await pending;
        release2();
    });

    it("grants up to max_concurrent slots per key", async () => {
        const limiter = createConcurrencyLimiter(3);
        const releases = [await limiter.acquire("a"), await limiter.acquire("a"), await limiter.acquire("a")];

        const pending = limiter.acquire("a");
        assert.strictEqual(await isSettled(pending), false);

        releases[0]!();
        const release4 = await pending;
        for(const release of [releases[1]!, releases[2]!, release4]) release();
    });

    it("frees exactly one slot per release", async () => {
        const limiter = createConcurrencyLimiter(2);
        const release1 = await limiter.acquire("a");
        const release2 = await limiter.acquire("a");
        const pending = [limiter.acquire("a"), limiter.acquire("a")];

        release1();
        const settled = await Promise.all(pending.map(isSettled));
        assert.strictEqual(settled.filter(Boolean).length, 1);

        release2();
        for(const release of await Promise.all(pending)) release();
    });

    it("ignores repeated calls of one release function", async () => {
        const limiter = createConcurrencyLimiter(1);
        const release1 = await limiter.acquire("a");
        const pending = [limiter.acquire("a"), limiter.acquire("a")];

        release1();
        release1();
        assert.deepStrictEqual(await Promise.all(pending.map(isSettled)), [true, false]);

        (await pending[0]!)();
        (await pending[1]!)();
    });

    it("grants waiting acquires in call order", async () => {
        const limiter = createConcurrencyLimiter(1);
        const order: number[] = [];
        const release = await limiter.acquire("a");
        const pending = [0, 1, 2].map(async (i) => {
            const release_i = await limiter.acquire("a");
            order.push(i);
            release_i();
        });

        release();
        await Promise.all(pending);
        assert.deepStrictEqual(order, [0, 1, 2]);
    });

    it("grants the full capacity again after every slot is released", async () => {
        const limiter = createConcurrencyLimiter(2);
        for(const release of [await limiter.acquire("a"), await limiter.acquire("a")]) release();

        const releases = [limiter.acquire("a"), limiter.acquire("a")];
        assert.deepStrictEqual(await Promise.all(releases.map(isSettled)), [true, true]);
        assert.strictEqual(await isSettled(limiter.acquire("a")), false);
    });

    it("tracks keys independently", async () => {
        const limiter = createConcurrencyLimiter(1);

        const release_a = await limiter.acquire("a");
        const pending_b = limiter.acquire("b");
        const pending_empty = limiter.acquire("");
        assert.strictEqual(await isSettled(pending_b), true);
        assert.strictEqual(await isSettled(pending_empty), true);
        assert.strictEqual(await isSettled(limiter.acquire("a")), false);

        release_a();
        (await pending_b)();
        (await pending_empty)();
    });

    it("throws RangeError unless max_concurrent is a positive integer", () => {
        for(const max of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.throws(() => createConcurrencyLimiter(max), RangeError, String(max));
        }
    });
});
