import {StelaroError} from "../error.ts";

/**
 * Thrown when referencing a component id not registered in the application.
 *
 * @category Errors
 */
export class UnregisteredComponentError extends StelaroError {
    /** The unregistered component id */
    readonly component_id: string;

    constructor(component_id: string) {
        super(`Component "${component_id}" is not registered in the application.`);
        this.component_id = component_id;
    }
}

/**
 * Thrown when two components share the same id.
 *
 * @category Errors
 */
export class DuplicateComponentIdError extends StelaroError {
    /** The duplicated component id */
    readonly component_id: string;

    constructor(component_id: string) {
        super(`Duplicate component id: "${component_id}".`);
        this.component_id = component_id;
    }
}

/**
 * Thrown when a component declares a dependency not present in the application.
 *
 * @category Errors
 */
export class MissingDependencyError extends StelaroError {
    /** Component that declared the dependency */
    readonly component_id: string;
    /** The missing dependency's component id */
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

/**
 * Thrown when a component's call surface has no corresponding handler.
 *
 * @category Errors
 */
export class MissingHandlerError extends StelaroError {
    /** Component that is missing the handler */
    readonly component_id: string;
    /** Name of the unhandled call */
    readonly call_name: string;

    constructor(component_id: string, call_name: string) {
        super(
            `Component "${component_id}" does not define a handler for "${call_name}".`,
        );
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * Thrown when multiple components expose calls with identical qualified keys.
 *
 * @category Errors
 */
export class DuplicateCallError extends StelaroError {
    /** The `component_id.call_name` keys that collide */
    readonly duplicate_keys: readonly string[];

    constructor(duplicate_keys: readonly string[]) {
        super(
            `Application contains duplicate component call ids: ${duplicate_keys.join(", ")}.`,
        );
        this.duplicate_keys = duplicate_keys;
    }
}

/**
 * Thrown when dispatching a call reference not registered in the application.
 *
 * @category Errors
 */
export class UnregisteredCallError extends StelaroError {
    /** Component id from the call reference */
    readonly component_id: string;
    /** Call name from the call reference */
    readonly call_name: string;

    constructor(component_id: string, call_name: string) {
        super(
            `Component call "${component_id}.${call_name}" is not registered in the application.`,
        );
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * Thrown when a component invokes a call it did not declare in its `uses`.
 *
 * @category Errors
 */
export class UndeclaredCallError extends StelaroError {
    /** Component that attempted the call */
    readonly component_id: string;
    /** Target component id of the undeclared call */
    readonly target_component_id: string;
    /** Target call name of the undeclared call */
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

/**
 * Thrown when the component dependency graph contains a cycle.
 *
 * @category Errors
 */
export class CircularDependencyError extends StelaroError {
    /** Component ids involved in the cycle */
    readonly component_ids: readonly string[];

    constructor(component_ids: readonly string[]) {
        super(
            `Circular dependency detected among components: ${component_ids.join(", ")}.`,
        );
        this.component_ids = component_ids;
    }
}
