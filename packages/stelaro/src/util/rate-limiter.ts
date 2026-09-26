import {Deque} from "@jiminp/tooltool";

/**
 * Keyed sliding-window rate limiter.
 *
 * @category Utility
 */
export type RateLimiter = {
    /**
     * Checks whether a call for the key is within the limit, counting it only when allowed.
     *
     * @param key - Rate limiter bucket key
     * @returns `true` if the call is within the limit
     */
    check(key: string): boolean;
};

/**
 * Creates a keyed limiter that allows at most `limit` calls per key within any `window_ms` span.
 *
 * @param limit - Maximum number of calls per key within the window
 * @param window_ms - Sliding window duration in milliseconds
 * @returns A new {@link RateLimiter}
 * @throws {RangeError} When `limit` is not a positive integer or `window_ms` is not a positive finite number
 * @category Utility
 */
export function createRateLimiter(limit: number, window_ms: number): RateLimiter {
    if(!Number.isInteger(limit) || limit < 1) {
        throw new RangeError(`limit must be a positive integer; got ${limit}.`);
    }
    if(!Number.isFinite(window_ms) || window_ms <= 0) {
        throw new RangeError(`window_ms must be a positive finite number; got ${window_ms}.`);
    }

    // Keys are reinserted on every recorded call, so iteration order is oldest-newest-entry first.
    const timestamps = new Map<string, Deque<number>>();

    return {
        check(key: string): boolean {
            const now = performance.now();
            const cutoff = now - window_ms;

            for(const [stale_key, stale_entries] of timestamps) {
                if(stale_entries.at(-1)! > cutoff) break;
                timestamps.delete(stale_key);
            }

            const entries = timestamps.get(key) ?? new Deque<number>();
            while(entries.length > 0 && entries.at(0)! <= cutoff) {
                entries.shift();
            }

            if(entries.length >= limit) {
                return false;
            }

            entries.push(now);
            timestamps.delete(key);
            timestamps.set(key, entries);
            return true;
        },
    };
}
