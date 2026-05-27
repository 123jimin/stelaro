import {Deque} from "@jiminp/tooltool";

/**
 * Keyed semaphore that limits concurrent operations per key.
 *
 * @category Utility
 */
export type ConcurrencyLimiter = {
    /**
     * Acquires a concurrency slot for the given key, waiting in FIFO order if full.
     *
     * @param key - Concurrency bucket key
     * @returns A release function that frees the slot
     */
    acquire(key: string): Promise<() => void>;
};

type KeyState = {
    active: number;
    queue: Deque<() => void>;
};

/**
 * Creates a keyed concurrency limiter backed by a FIFO queue per key.
 *
 * Key state is cleaned up automatically when all slots are released and the
 * queue is empty.
 *
 * @param max_concurrent - Maximum concurrent acquires per key
 * @returns A new {@link ConcurrencyLimiter}
 * @category Utility
 */
export function createConcurrencyLimiter(max_concurrent: number): ConcurrencyLimiter {
    const keys = new Map<string, KeyState>();

    function getState(key: string): KeyState {
        let state = keys.get(key);
        if(state == null) {
            state = {active: 0, queue: new Deque()};
            keys.set(key, state);
        }
        return state;
    }

    function release(key: string): void {
        const state = keys.get(key);
        if(state == null) return;

        state.active--;

        const next = state.queue.shift();
        if(next != null) {
            state.active++;
            next();
        } else if(state.active === 0) {
            keys.delete(key);
        }
    }

    return {
        acquire(key: string): Promise<() => void> {
            const state = getState(key);

            if(state.active < max_concurrent) {
                state.active++;
                return Promise.resolve(() => { release(key); });
            }

            return new Promise<() => void>((resolve) => {
                state.queue.push(() => {
                    resolve(() => { release(key); });
                });
            });
        },
    };
}
