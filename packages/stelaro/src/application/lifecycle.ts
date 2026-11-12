import {StelaroError} from "../error.ts";

/**
 * The current phase of an application lifecycle.
 *
 * @category Application
 */
export type LifecycleState = "idle" | "starting" | "active" | "reloading" | "failed" | "stopping";

/**
 * An error raised when an operation is unavailable in the current lifecycle state.
 *
 * @category Errors
 */
export class LifecycleStateError extends StelaroError {
    /** The application state when the operation was attempted. */
    readonly current_state: LifecycleState;

    /** The name of the attempted operation. */
    readonly operation: string;

    /**
     * Create an error for an invalid lifecycle operation.
     *
     * @param current_state - State when the operation was attempted
     * @param operation - Name of the attempted operation
     */
    constructor(current_state: LifecycleState, operation: string) {
        super(`Cannot ${operation} while the application is ${current_state}.`);
        this.current_state = current_state;
        this.operation = operation;
    }
}

export type LifecycleMachine = {
    readonly state: LifecycleState;
    applyTransition(operation: string, allowed_from: readonly LifecycleState[], next_state: LifecycleState): void;
};

export function createLifecycleMachine(): LifecycleMachine {
    let state: LifecycleState = "idle";
    return {
        get state() { return state; },
        applyTransition(operation, allowed_from, next_state) {
            if(!allowed_from.includes(state)) {
                throw new LifecycleStateError(state, operation);
            }
            state = next_state;
        },
    };
}
