import {PerantoError} from "./error.ts";

export type LifecycleState = "idle" | "starting" | "stopping" | "active" | "failed";

export class LifecycleStateError extends PerantoError {
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
