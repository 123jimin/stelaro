+++
id = "s0003"
title = "Component"
tags = ["component", "architecture", "lifecycle", "config", "logging"]
+++

## Types

Types are shown at their widest readable form. Implementations SHOULD be as
narrow as possible: handlers infer input and output from their call
declarations, and `uses` limits the references accepted by `context.call`.

```typescript
interface ComponentCallSchema {
    readonly inferIn: unknown;
    readonly infer: unknown;
    assert(input: unknown): this["infer"];
}

type ComponentCallReference = {
    readonly component_id: ComponentId;
    readonly name: ComponentCallName;
    readonly input: ComponentCallSchema;
    readonly output: ComponentCallSchema;
};

type ComponentCallDeclarations = Record<ComponentCallName, {
    readonly input: ComponentCallSchema;
    readonly output: ComponentCallSchema;
}>;

type ComponentCalls = {
    readonly id: ComponentId;
    readonly calls: Record<ComponentCallName, ComponentCallReference>;
};

type StateFactory<TState> = () => TState;

type Component = {
    readonly calls: ComponentCalls;
    readonly uses: readonly ComponentCalls[];
    readonly config?: ConfigSchema;
    readonly state?: StateFactory<unknown>;
    readonly start?: (context: ComponentContext) => Promisable<void>;
    readonly stop?: (context: ComponentContext) => Promisable<void>;
    readonly onConfigReload?: (context: ComponentContext) => Promisable<void>;
    readonly handlers: Record<ComponentCallName,
        | ((context: ComponentContext, input: unknown) => Promisable<unknown>)
        | { handle(context: ComponentContext, input: unknown): Promisable<unknown> }
    >;
};

function defineComponentCalls(id: ComponentId, declarations: ComponentCallDeclarations): ComponentCalls;
function mergeComponentCalls(first: ComponentCalls, ...rest: ComponentCalls[]): ComponentCalls;
function defineComponent(definition: Component): Component;
const EmptyInput: ComponentCallSchema;
interface LocalSchema<T> extends ComponentCallSchema {
    readonly infer: T;
    readonly inferIn: T;
}
function defineLocalInput<T>(): LocalSchema<T>;
function defineLocalOutput<T>(): LocalSchema<T>;
function isLocalSchema(call_schema: ComponentCallSchema): boolean;
```

## Behavior

- Component calls provide typed IPC-like boundaries without requiring
  cross-process transport.
- `mergeComponentCalls` combines several call surfaces with the same component id into one, for example a public surface and an internal surface.
  - It throws `MismatchedComponentIdError` if the ids differ and `DuplicateCallError` if two inputs declare the same call name.
- A handler may be a callable `(context, input) => ...` or an object with
  `handle(context, input)`; both dispatch identically.
- `EmptyInput` is the input schema for a call that takes no
  arguments. It accepts only `{}` and rejects arrays and objects with any keys.
- `defineLocalInput<T>()` and `defineLocalOutput<T>()` return a call input or
  output schema for values of type `T` that never leave the process. Dispatch
  passes such a value through without checking it. The component that creates
  such a value disposes of it. A handler may keep a local input after the call
  returns; the caller's component stops first, so it withdraws the input in its
  stop hook when the input must not be used after that.
  - `isLocalSchema` tells whether a schema came from either
    factory, so that gateways can refuse local schemas.
- UNIMPLEMENTED Components may use gateway capabilities through typed
  component calls.
- A state factory creates state for one component in one application runtime.
  Definitions reused across runtimes receive independent state, and components
  in one runtime never share state.
- State persists across stop/start cycles of its application runtime but has no
  persistent-storage semantics.

## Constraints

- Component behavior belongs to core and MUST NOT require raw gateway objects.
- Component ids MUST be stable, lowercase kebab-case public identities.
- Component call names SHOULD be camelCase.
- Call inputs and outputs MUST use Arktype schemas or local schemas
  (`defineLocalInput`, `defineLocalOutput`) and remain typed through
  declaration, handler dispatch, and `context.call`.
- Components MAY depend on typed calls exposed by gateway components.

## Anticipated Changes

- Component id rules, resources, templates, reloading, HMR state migration,
  and state-concurrency helpers may be specified later.
