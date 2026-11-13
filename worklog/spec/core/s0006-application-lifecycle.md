+++
id = "s0006"
title = "Application Lifecycle"
tags = ["application", "architecture", "lifecycle", "config", "logging", "util"]
paths = ["packages/stelaro/src/application/**", "packages/stelaro/src/signal/**"]
+++

# Application Lifecycle

## Lifecycle types

```typescript
type LifecycleState = "idle" | "starting" | "active" | "reloading" | "failed" | "stopping";

class LifecycleStateError extends StelaroError {
    readonly current_state: LifecycleState;
    readonly operation: string;
    constructor(current_state: LifecycleState, operation: string);
}
```

## Application API (UNIMPLEMENTED)

Types are shown at their widest for readability.
`call` MUST accept only references exposed by registered components and infer input and output from each reference.
See s0007 for `ApplicationOptions` and s0011 and s0013 for data access and logging.

```typescript
type ApplicationDefinition = {
    readonly components: readonly AnyComponent[];
    readonly logger?: LoggerFactory;
    readonly onConfigReload?: () => Promisable<void>;
};

type Application = {
    readonly data: DataAccess;
    readonly logger: LoggerFactory;
    start(): Promise<void>;
    stop(): Promise<void>;
    call(reference: AnyComponentCallReference, input: unknown): Promise<unknown>;
    reloadConfig(): Promise<void>;
    reloadComponentConfig(component_id: ComponentId): Promise<void>;
};

function defineApplication(definition: ApplicationDefinition): ApplicationDefinition;
function createApplication(definition: ApplicationDefinition, options?: ApplicationOptions): Application;
```

## Component registration

- The component registry indexes components by ID, pairs call references with their handlers, and computes start order from the `uses` graph.
  - `DuplicateComponentIdError` reports the conflicting `component_id`.
  - `MissingHandlerError` and `DuplicateCallError` report the `component_id` and `call_name`.
  - `CircularDependencyError.cycle` lists the component IDs along the cycle and repeats the starting ID at the end.
- A `uses` entry names a registered component by its ID and may describe a subset of the registered call surface assembled with `mergeComponentCalls` (s0005).
  - A missing component throws `MissingDependencyError` with the consumer's `component_id` and the missing `dependency_id`.
  - Each call reference in the entry must be the same object as the corresponding registered reference.
    `UnregisteredCallError` reports the target `component_id` and `call_name` when the reference is absent.
- `sortComponentsByUses(components)` returns components in start order for callers outside an application.
  - It sorts by dependency ID, ignores dependencies on components absent from the list, and rejects duplicate IDs and cycles.

## Application registration and dispatch (UNIMPLEMENTED)

- `createApplication` uses the component registry and initializes runtime state.
- Calls are valid only while `active` or `reloading`.
- The application definition determines the registered call surfaces.
- Dispatch to an unregistered call throws `UnregisteredCallError`.
- A call input schema failure throws `CallInputError` before the handler runs.
  - Its `cause` is the original schema failure.
  - Call output failures propagate the ArkType error unchanged.
- `UnregisteredComponentError` reports an operation targeting an unregistered component.

## Lifecycle machine

- The internal `createLifecycleMachine()` creates an independent machine in `idle`.
- The caller supplies the allowed source states to `applyTransition(operation, allowed_from, next_state)`.
  - The machine enters `next_state` when its current state is in `allowed_from`.
  - Invalid transitions throw `LifecycleStateError` carrying the current state and attempted operation. The state is preserved.

## Application start and stop (UNIMPLEMENTED)

- The application drives lifecycle transitions, invokes component hooks, and tracks which components have started.
- `start()` moves `idle → starting → active`.
  - Startup preparation, including configuration validation, runs in `starting` before any component hook (s0009).
  - Components start in topological dependency order and become active when their start hook is absent or completes.
  - Start failure moves the application to `failed`. Components already started stay active.
- `stop()` moves `active | failed → stopping → idle`.
  - It stops only active components, in reverse dependency order, and attempts all cleanup.
  - Any stop errors cause `stop()` to reject with an `AggregateError` after the application reaches `idle`.
- Start and stop operations from invalid lifecycle states reject with `LifecycleStateError` carrying the current state and attempted operation.

## Configuration reload (UNIMPLEMENTED)

- `reloadConfig()` and `reloadComponentConfig()` are valid only while `active`.
  - Reload moves the application to `reloading` and returns to `active` on success without restarting component state.
  - A component or application hook failure during `reloadConfig()` moves the application to `failed`.
  - See s0009 for validation, configuration swaps, and reload hooks.
- Reload operations from invalid lifecycle states reject with `LifecycleStateError`.

## Lifecycle logging (UNIMPLEMENTED)

- Configuration and component lifecycle transitions are logged through the configured logger.
  - The default is the core console logger and verbosity follows the logger level (s0013).

## Signals (UNIMPLEMENTED)

- Signal handling is opt-in.
- `attachSignalHandlers(application, options?)` listens for `SIGINT` and `SIGTERM` and returns a cleanup function.
- The first signal logs shutdown and calls `app.stop()`.
  - Further signals are ignored while stopping.
- Successful shutdown exits with code 0. A rejected `stop()`, including a `LifecycleStateError`, exits with code 1.
- Shutdown exits with code 1 if `stop()` exceeds the configured timeout.
  - The default is 10 seconds. `null` disables it.
- Cleanup removes only listeners installed by that attachment, after which Node's default signal behavior resumes.
- Logging uses an option-provided logger when present.
  - Otherwise it uses the application factory with the `signal` scope and falls back to the default console logger with the same scope.
  - Signal receipt is `info` and timeout is `error`.
- Signal handling MUST preserve the application's own `stop()` error handling.
  - Attaching in an environment without signals MUST be a no-op or report an error without crashing.

## Anticipated changes

- Custom signal sets and logger integration may be specified later.
