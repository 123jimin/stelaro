export abstract class PerantoError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class MissingDependencyError extends PerantoError {
    readonly component_id: string;
    readonly dependency_id: string;

    constructor(componentId: string, dependencyId: string) {
        super(
            `Component "${componentId}" uses component calls "${dependencyId}"`
            + " that are not registered in the application.",
        );
        this.component_id = componentId;
        this.dependency_id = dependencyId;
    }
}

export class MissingHandlerError extends PerantoError {
    readonly component_id: string;
    readonly call_name: string;

    constructor(componentId: string, callName: string) {
        super(
            `Component "${componentId}" does not define a handler for "${callName}".`,
        );
        this.component_id = componentId;
        this.call_name = callName;
    }
}

export class DuplicateCallError extends PerantoError {
    readonly duplicate_keys: readonly string[];

    constructor(duplicateKeys: readonly string[]) {
        super(
            `Application contains duplicate component call ids: ${duplicateKeys.join(", ")}.`,
        );
        this.duplicate_keys = duplicateKeys;
    }
}

export class UnregisteredCallError extends PerantoError {
    readonly component_id: string;
    readonly call_name: string;

    constructor(componentId: string, callName: string) {
        super(
            `Component call "${componentId}.${callName}" is not registered in the application.`,
        );
        this.component_id = componentId;
        this.call_name = callName;
    }
}

export class UndeclaredCallError extends PerantoError {
    readonly component_id: string;
    readonly target_component_id: string;
    readonly target_call_name: string;

    constructor(componentId: string, targetComponentId: string, targetCallName: string) {
        super(
            `Component "${componentId}" cannot call "${targetComponentId}.${targetCallName}"`
            + " because it did not declare that call surface in uses.",
        );
        this.component_id = componentId;
        this.target_component_id = targetComponentId;
        this.target_call_name = targetCallName;
    }
}

export class CircularDependencyError extends PerantoError {}

export class LifecycleStateError extends PerantoError {}
