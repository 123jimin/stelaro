import type {ComponentCallName, ComponentId} from "../component/calls.ts";
import {StelaroError} from "../error.ts";
import {quote} from "../util/index.ts";

/**
 * An error raised when more than one component has the same ID.
 *
 * @category Errors
 */
export class DuplicateComponentIdError extends StelaroError {
    /** The ID shared by the conflicting components. */
    readonly component_id: ComponentId;

    /**
     * Create an error for a duplicate component ID.
     * @param component_id - Duplicate component ID
     */
    constructor(component_id: ComponentId) {
        super(`Component ${quote(component_id)} is listed more than once.`);
        this.component_id = component_id;
    }
}

/**
 * An error raised when a component declares a dependency that is absent.
 *
 * @category Errors
 */
export class MissingDependencyError extends StelaroError {
    /** The ID of the component declaring the dependency. */
    readonly component_id: ComponentId;
    /** The ID of the missing dependency. */
    readonly dependency_id: ComponentId;

    /**
     * Create an error for a missing dependency.
     * @param component_id - ID of the component declaring the dependency
     * @param dependency_id - ID of the missing dependency
     */
    constructor(component_id: ComponentId, dependency_id: ComponentId) {
        super(`Component ${quote(component_id)} requires unregistered component ${quote(dependency_id)}.`);
        this.component_id = component_id;
        this.dependency_id = dependency_id;
    }
}

/**
 * An error raised when a declared call has no handler.
 *
 * @category Errors
 */
export class MissingHandlerError extends StelaroError {
    /** The ID of the component declaring the call. */
    readonly component_id: ComponentId;
    /** The name of the call without a handler. */
    readonly call_name: ComponentCallName;

    /**
     * Create an error for a missing call handler.
     * @param component_id - ID of the component declaring the call
     * @param call_name - Name of the call without a handler
     */
    constructor(component_id: ComponentId, call_name: ComponentCallName) {
        super(`Component ${quote(component_id)} has no handler for call ${quote(call_name)}.`);
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * An error raised when a call reference is absent from the registered surface.
 *
 * @category Errors
 */
export class UnregisteredCallError extends StelaroError {
    /** The ID of the target component. */
    readonly component_id: ComponentId;
    /** The name of the unregistered call. */
    readonly call_name: ComponentCallName;

    /**
     * Create an error for an unregistered call.
     * @param component_id - ID of the target component
     * @param call_name - Name of the unregistered call
     */
    constructor(component_id: ComponentId, call_name: ComponentCallName) {
        super(`Call ${quote(call_name)} is not registered for component ${quote(component_id)}.`);
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * An error raised when a component calls a reference absent from its dependencies.
 *
 * @category Errors
 */
export class UndeclaredCallError extends StelaroError {
    /** The component that attempted the call. */
    readonly caller_id: ComponentId;
    /** The target component. */
    readonly component_id: ComponentId;
    /** The name of the undeclared call. */
    readonly call_name: ComponentCallName;

    /**
     * Create an error for a call absent from the caller's dependency surfaces.
     *
     * @param caller_id - ID of the calling component
     * @param component_id - ID of the target component
     * @param call_name - Name of the undeclared call
     */
    constructor(caller_id: ComponentId, component_id: ComponentId, call_name: ComponentCallName) {
        super(`Component ${quote(caller_id)} did not declare a dependency on call ${quote(call_name)} from ${quote(component_id)}.`);
        this.caller_id = caller_id;
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * An error raised when a call input fails schema validation.
 *
 * @category Errors
 */
export class CallInputError extends StelaroError {
    /** The target component. */
    readonly component_id: ComponentId;
    /** The name of the call whose input failed validation. */
    readonly call_name: ComponentCallName;

    /**
     * Create an error for a call input schema failure.
     *
     * @param component_id - ID of the target component
     * @param call_name - Name of the call
     * @param cause - Original schema error
     */
    constructor(component_id: ComponentId, call_name: ComponentCallName, cause: unknown) {
        super(`Input to call ${quote(call_name)} on component ${quote(component_id)} failed validation.`, {cause});
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/**
 * An error raised when component dependencies form a cycle.
 *
 * @category Errors
 */
export class CircularDependencyError extends StelaroError {
    /** The dependency cycle, with its starting ID repeated at the end. */
    readonly cycle: readonly ComponentId[];

    /**
     * Create an error for a dependency cycle.
     * @param cycle - Component IDs in dependency order, including the repeated starting ID
     */
    constructor(cycle: readonly ComponentId[]) {
        super(`Circular component dependency: ${cycle.join(" → ")}.`);
        this.cycle = [...cycle];
    }
}
