import {StelaroError} from "../error.ts";

/** A state in the application or component lifecycle.
 *
 * @category Lifecycle
 */
export type LifecycleState = "idle" | "starting" | "stopping" | "active" | "reloading" | "failed";

/**
 * Thrown when an operation is attempted in an incompatible lifecycle state.
 *
 * @category Errors
 */
export class LifecycleStateError extends StelaroError {
    /** State the machine was in when the operation was attempted */
    readonly current_state: LifecycleState;
    /** Name of the operation that was rejected */
    readonly operation: string;

    constructor(current_state: LifecycleState, operation: string) {
        super(
            `Cannot "${operation}" while application is "${current_state}".`,
        );
        this.current_state = current_state;
        this.operation = operation;
    }
}

/** Mutable lifecycle state with a guard for allowed states. */
export type LifecycleMachine = {
    readonly state: LifecycleState;
    /** Throws {@link LifecycleStateError} unless the current state is in `expected`. */
    require(expected: LifecycleState | readonly LifecycleState[], operation: string): void;
    enter(state: LifecycleState): void;
};

/** Creates a lifecycle machine in the `idle` state. */
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
