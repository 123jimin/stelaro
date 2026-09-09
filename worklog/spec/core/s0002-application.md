+++
id = "s0002"
title = "Application"
tags = ["application", "architecture", "lifecycle", "config", "logging"]
+++

## Types

Types are shown erased to their widest form for readability. Implementations
SHOULD be as narrow as possible: `call` accepts only references from registered
components' call surfaces, with input and output types inferred from each
reference.

```typescript
type LifecycleState = "idle" | "starting" | "active" | "reloading" | "failed" | "stopping";

type ApplicationDefinition = {
    readonly components: readonly AnyComponent[];
    readonly logger?: LoggerFactory;
    readonly data: DataAccess;
    readonly config?: ConfigSchema;
    readonly secrets?: ConfigSchema;
    readonly onConfigReload?: () => Promisable<void>;
};

type ApplicationOptions = { readonly base_dir?: string; readonly env?: string | null };

type Application = {
    readonly config: unknown;               // null when no config schema exists
    readonly secrets: unknown;              // null when no secrets schema exists
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

## Behavior

- `createApplication` rejects duplicate component ids, missing handlers, and
  circular `uses` dependencies (`CircularDependencyError`). It computes a
  topological component order from the `uses` graph and initializes runtime
  state before dispatching calls.
- Components start in topological dependency order and stop in reverse order.
  A component is active when its start hook is absent or completes.
- `start()` moves `idle → starting → active`. A start failure moves the app to
  `failed`; already-started components are not rolled back.
- `stop()` moves `active | failed → stopping → idle`, stops only active
  components, and attempts cleanup best-effort. All stop errors are collected
  in an `AggregateError`; the app still reaches `idle`.
- Calls are valid only in `active` or `reloading`. `start`, `stop`, and config
  reload operations reject when called from an invalid state with
  `LifecycleStateError`.
- `reloadConfig()` and `reloadComponentConfig()` are valid only in `active`.
  Reload enters `reloading`, validates the new configuration, invokes the
  applicable reload hook, and returns to `active`; component state is not
  restarted.
- Configuration and component lifecycle transitions are logged through the
  configured logger. The default is the core console logger; verbosity follows
  the logger level.

## Constraints

- Application runtime state is initialized during `createApplication`.
- Implementations must keep the public API as narrow as possible: `call`
  accepts only references exposed by registered components, and its accepted
  input and returned output types are inferred from the referenced call.
- The application definition's component list determines the registered call
  surfaces. Calls to unregistered components or calls not exposed by those
  surfaces are rejected.

## Anticipated Changes

- Gateway registration may be specified separately.
