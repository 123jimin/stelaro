import {Deque} from "@jiminp/tooltool";

/** @category Utility */
export type ConcurrencyLimiter = {
    acquire(key: string): Promise<() => void>;
};

type KeyState = {
    active: number;
    queue: Deque<() => void>;
};

/** @category Utility */
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
