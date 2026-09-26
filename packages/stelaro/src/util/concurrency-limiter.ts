import {Deque} from "@jiminp/tooltool";

/**
 * Keyed semaphore that limits concurrent operations per key.
 *
 * @category Utility
 */
export type ConcurrencyLimiter = {
    /**
     * Acquires a slot for the key, waiting in FIFO order while the key is full.
     *
     * @param key - Concurrency bucket key
     * @returns A release function that frees the slot; repeat calls are ignored
     */
    acquire(key: string): Promise<() => void>;
};

type KeyState = {
    active: number;
    queue: Deque<() => void>;
};

/**
 * Creates a keyed limiter that grants at most `max_concurrent` slots per key in FIFO order.
 *
 * @param max_concurrent - Maximum concurrent slots per key
 * @returns A new {@link ConcurrencyLimiter}
 * @throws {RangeError} When `max_concurrent` is not a positive integer
 * @category Utility
 */
export function createConcurrencyLimiter(max_concurrent: number): ConcurrencyLimiter {
    if(!Number.isInteger(max_concurrent) || max_concurrent < 1) {
        throw new RangeError(`max_concurrent must be a positive integer; got ${max_concurrent}.`);
    }

    const keys = new Map<string, KeyState>();

    function createRelease(key: string, state: KeyState): () => void {
        let released = false;
        return () => {
            if(released) return;
            released = true;

            const next = state.queue.shift();
            if(next != null) {
                next();
                return;
            }

            state.active--;
            if(state.active === 0) keys.delete(key);
        };
    }

    return {
        acquire(key: string): Promise<() => void> {
            let state = keys.get(key);
            if(state == null) {
                state = {active: 0, queue: new Deque()};
                keys.set(key, state);
            }

            if(state.active < max_concurrent) {
                state.active++;
                return Promise.resolve(createRelease(key, state));
            }

            return new Promise<() => void>((resolve) => {
                state.queue.push(() => { resolve(createRelease(key, state)); });
            });
        },
    };
}
