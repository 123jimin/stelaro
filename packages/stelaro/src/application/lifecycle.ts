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

    constructor(currentState: LifecycleState, operation: string) {
        super(
            `Cannot "${operation}" while application is "${currentState}".`,
        );
        this.current_state = currentState;
        this.operation = operation;
    }
}

/**
 * Tracks lifecycle state and guards operations against invalid transitions.
 *
 * @category Lifecycle
 */
export type LifecycleMachine = {
    /** Current lifecycle state */
    readonly state: LifecycleState;
    /**
     * Throws {@link LifecycleStateError} if the current state is not in `expected`.
     *
     * @param expected - Allowed state or states
     * @param operation - Name of the guarded operation, used in the error message
     * @throws {LifecycleStateError} If the current state does not match
     */
    require(expected: LifecycleState | readonly LifecycleState[], operation: string): void;
    /**
     * Transitions to a new state unconditionally.
     *
     * @param state - Target state
     */
    enter(state: LifecycleState): void;
};

/**
 * Creates a lifecycle state machine starting in the `"idle"` state.
 *
 * @returns A new {@link LifecycleMachine}
 * @category Lifecycle
 */
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
