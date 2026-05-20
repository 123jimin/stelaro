import {StelaroError} from "../error.ts";

export type LifecycleState = "idle" | "starting" | "stopping" | "active" | "reloading" | "failed";

export class LifecycleStateError extends StelaroError {
    readonly current_state: LifecycleState;
    readonly operation: string;

    constructor(currentState: LifecycleState, operation: string) {
        super(
            `Cannot "${operation}" while application is "${currentState}".`,
        );
        this.current_state = currentState;
        this.operation = operation;
    }
}

export type LifecycleMachine = {
    readonly state: LifecycleState;
    require(expected: LifecycleState | readonly LifecycleState[], operation: string): void;
    enter(state: LifecycleState): void;
};

export function createLifecycleMachine(): LifecycleMachine {
    let current: LifecycleState = "idle";

    return {
        get state() { return current; },

        require(expected, operation) {
            const allowed = Array.isArray(expected) ? expected : [expected];
            if(!allowed.includes(current)) {
                throw new LifecycleStateError(current, operation);
            }
        },

        enter(state) {
            current = state;
        },
    };
}
