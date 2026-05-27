import {Deque} from "@jiminp/tooltool";

/**
 * Keyed sliding-window rate limiter.
 *
 * @category Utility
 */
export type RateLimiter = {
    /**
     * Records a call for the given key and checks whether it is within the limit.
     *
     * @param key - Rate limiter bucket key
     * @returns `true` if the call is within the limit
     */
    check(key: string): boolean;
};

/**
 * Creates a keyed sliding-window rate limiter using monotonic timestamps.
 *
 * @param limit - Maximum number of calls per key within the window
 * @param window_ms - Sliding window duration in milliseconds
 * @returns A new {@link RateLimiter}
 * @category Utility
 */
export function createRateLimiter(limit: number, window_ms: number): RateLimiter {
    const timestamps = new Map<string, Deque<number>>();

    return {
        check(key: string): boolean {
            const now = performance.now();
            const cutoff = now - window_ms;

            let entries = timestamps.get(key);
            if(entries == null) {
                entries = new Deque<number>();
                timestamps.set(key, entries);
            }

            while(entries.length > 0 && entries.at(0)! <= cutoff) {
                entries.shift();
            }

            if(entries.length >= limit) {
                return false;
            }

            entries.push(now);
            return true;
        },
    };
}
