import {PerantoError} from "../error.ts";

export class UnregisteredComponentError extends PerantoError {
    readonly component_id: string;

    constructor(component_id: string) {
        super(`Component "${component_id}" is not registered in the application.`);
        this.component_id = component_id;
    }
}

export class DuplicateComponentIdError extends PerantoError {
    readonly component_id: string;

    constructor(component_id: string) {
        super(`Duplicate component id: "${component_id}".`);
        this.component_id = component_id;
    }
}

export class MissingDependencyError extends PerantoError {
    readonly component_id: string;
    readonly dependency_id: string;

    constructor(component_id: string, dependency_id: string) {
        super(
            `Component "${component_id}" uses component calls "${dependency_id}"`
            + " that are not registered in the application.",
        );
        this.component_id = component_id;
        this.dependency_id = dependency_id;
    }
}

export class MissingHandlerError extends PerantoError {
    readonly component_id: string;
    readonly call_name: string;

    constructor(component_id: string, call_name: string) {
        super(
            `Component "${component_id}" does not define a handler for "${call_name}".`,
        );
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

export class DuplicateCallError extends PerantoError {
    readonly duplicate_keys: readonly string[];

    constructor(duplicate_keys: readonly string[]) {
        super(
            `Application contains duplicate component call ids: ${duplicate_keys.join(", ")}.`,
        );
        this.duplicate_keys = duplicate_keys;
    }
}

export class UnregisteredCallError extends PerantoError {
    readonly component_id: string;
    readonly call_name: string;

    constructor(component_id: string, call_name: string) {
        super(
            `Component call "${component_id}.${call_name}" is not registered in the application.`,
        );
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

export class UndeclaredCallError extends PerantoError {
    readonly component_id: string;
    readonly target_component_id: string;
    readonly target_call_name: string;

    constructor(component_id: string, target_component_id: string, target_call_name: string) {
        super(
            `Component "${component_id}" cannot call "${target_component_id}.${target_call_name}"`
            + " because it did not declare that call surface in uses.",
        );
        this.component_id = component_id;
        this.target_component_id = target_component_id;
        this.target_call_name = target_call_name;
    }
}

export class CircularDependencyError extends PerantoError {
    readonly component_ids: readonly string[];

    constructor(component_ids: readonly string[]) {
        super(
            `Circular dependency detected among components: ${component_ids.join(", ")}.`,
        );
        this.component_ids = component_ids;
    }
}
