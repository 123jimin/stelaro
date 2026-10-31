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
});
