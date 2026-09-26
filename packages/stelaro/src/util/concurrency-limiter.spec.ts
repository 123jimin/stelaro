import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createConcurrencyLimiter} from "./concurrency-limiter.ts";

function isSettled(promise: Promise<unknown>): Promise<boolean> {
    let settled = false;
    const markSettled = () => {
        settled = true;
    };
    promise.then(markSettled, markSettled);
    return new Promise((resolve) => {
        setImmediate(() => { resolve(settled); });
    });
}

describe("@jiminp/stelaro concurrency limiter", () => {
    it("rejects an invalid max_concurrent", () => {
        for(const max_concurrent of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.throws(() => createConcurrencyLimiter(max_concurrent), RangeError);
        }
    });

    it("queues when at capacity and resolves on release", async () => {
        const limiter = createConcurrencyLimiter(1);

        const release1 = await limiter.acquire("a");
        const pending = limiter.acquire("a");
        assert.strictEqual(await isSettled(pending), false);

        release1();
        const release2 = await pending;
        release2();
    });

    it("processes queued acquires in FIFO order", async () => {
        const limiter = createConcurrencyLimiter(1);
        const order: number[] = [];

        const release1 = await limiter.acquire("a");

        const p2 = limiter.acquire("a").then((release) => {
            order.push(2);
            return release;
        });
        const p3 = limiter.acquire("a").then((release) => {
            order.push(3);
            return release;
        });

        release1();
        const release2 = await p2;
        release2();
        const release3 = await p3;
        release3();

        assert.deepStrictEqual(order, [2, 3]);
    });

    it("tracks keys independently", async () => {
        const limiter = createConcurrencyLimiter(1);

        const release_a = await limiter.acquire("a");
        const pending_b = limiter.acquire("b");
        assert.strictEqual(await isSettled(pending_b), true);

        release_a();
        (await pending_b)();
    });

    it("supports max_concurrent greater than 1", async () => {
        const limiter = createConcurrencyLimiter(3);
        const releases: Array<() => void> = [];

        releases.push(await limiter.acquire("a"));
        releases.push(await limiter.acquire("a"));
        releases.push(await limiter.acquire("a"));

        const p4 = limiter.acquire("a");
        assert.strictEqual(await isSettled(p4), false);

        releases[0]!();
        const release4 = await p4;

        releases[1]!();
        releases[2]!();
        release4();
    });

    it("ignores repeated calls to a release function", async () => {
        const limiter = createConcurrencyLimiter(1);

        const release1 = await limiter.acquire("a");
        release1();
        release1();

        const release2 = await limiter.acquire("a");
        release1();

        const pending = limiter.acquire("a");
        assert.strictEqual(await isSettled(pending), false);

        release2();
        (await pending)();
    });
});
