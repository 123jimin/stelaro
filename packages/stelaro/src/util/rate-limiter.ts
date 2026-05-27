import {Deque} from "@jiminp/tooltool";

/** @category Utility */
export type RateLimiter = {
    check(key: string): boolean;
};

/** @category Utility */
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
