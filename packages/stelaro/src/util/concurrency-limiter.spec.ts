import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createConcurrencyLimiter} from "./concurrency-limiter.ts";

describe("@jiminp/stelaro concurrency limiter", () => {
    it("resolves immediately when under capacity", async () => {
        const limiter = createConcurrencyLimiter(2);
        const release = await limiter.acquire("a");
        assert.strictEqual(typeof release, "function");
        release();
    });

    it("queues when at capacity and resolves on release", async () => {
        const limiter = createConcurrencyLimiter(1);
        const order: string[] = [];

        const release1 = await limiter.acquire("a");
        order.push("acquired-1");

        const pending = limiter.acquire("a").then((release) => {
            order.push("acquired-2");
            return release;
        });

        // Yield to confirm acquire-2 hasn't resolved yet
        await Promise.resolve();
        assert.deepStrictEqual(order, ["acquired-1"]);

        release1();
        const release2 = await pending;
        assert.deepStrictEqual(order, ["acquired-1", "acquired-2"]);
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
        const release_b = await limiter.acquire("b");

        // Both acquired immediately — different keys
        assert.strictEqual(typeof release_a, "function");
        assert.strictEqual(typeof release_b, "function");

        release_a();
        release_b();
    });

    it("supports max_concurrent greater than 1", async () => {
        const limiter = createConcurrencyLimiter(3);
        const releases: Array<() => void> = [];

        releases.push(await limiter.acquire("a"));
        releases.push(await limiter.acquire("a"));
        releases.push(await limiter.acquire("a"));

        let fourth_resolved = false;
        const p4 = limiter.acquire("a").then((release) => {
            fourth_resolved = true;
            return release;
        });

        await Promise.resolve();
        assert.strictEqual(fourth_resolved, false);

        releases[0]!();
        const release4 = await p4;
        assert.strictEqual(fourth_resolved, true);

        releases[1]!();
        releases[2]!();
        release4();
    });

    it("cleans up key state when fully released with no queue", async () => {
        const limiter = createConcurrencyLimiter(1);

        const release = await limiter.acquire("a");
        release();

        // Second acquire should resolve immediately — key was cleaned up
        const release2 = await limiter.acquire("a");
        release2();
    });
});
