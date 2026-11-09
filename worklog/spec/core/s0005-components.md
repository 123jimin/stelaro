+++
id = "s0005"
title = "Components"
tags = ["architecture", "component", "context", "lifecycle", "config", "logging"]
paths = ["packages/stelaro/src/component/**"]
+++

# Components (UNIMPLEMENTED)

## Types

These excerpts use wide types for readability.
Handler input and output SHOULD be inferred from their call declarations.
Context calls SHOULD accept only references declared in `uses` and infer input and output from each reference.
See s0009 for configuration and secrets declarations.

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

type ComponentContext = {
    readonly log: Logger;
    readonly data: DataAccess;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
    readonly state?: unknown;
    readonly config?: unknown;
    readonly secrets?: unknown;
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

## Call surfaces and handlers

- Component calls provide typed IPC-like boundaries without requiring cross-process transport.
- Component IDs MUST be stable, lowercase kebab-case public identities.
  - An invalid ID throws `InvalidComponentIdError`.
- Call names SHOULD be camelCase.
- `mergeComponentCalls` combines surfaces for the same component ID, such as a public surface and an internal surface.
  - `MismatchedComponentIdError` is thrown if IDs differ.
  - `DuplicateCallError` is thrown if two inputs declare the same call name.
- A handler may be a function `(context, input) => ...` or an object with `handle(context, input)`. Both forms dispatch identically.
- Inputs and outputs MUST use ArkType schemas or local schemas and remain typed through declaration, handler dispatch, and `context.call`.
- `EmptyInput` accepts only `{}` and rejects arrays and objects with any keys.
- `defineLocalInput<T>()` and `defineLocalOutput<T>()` create schemas for values that stay in the process.
  - Dispatch passes such values through without checking them.
  - `isLocalSchema` detects schemas from either factory.
- The component that creates a local value disposes of it.
  - A handler may keep a local input after the call returns.
  - The caller's component stops first, so it withdraws the input in its stop hook when the input must not be used after that.

## Context and state

- `context.call` accepts the references declared in `uses`.
  - A handler that calls a reference absent from `uses` receives `UndeclaredCallError`.
  - See s0006 for registration and dispatch.
- Every component receives `log` (s0013) and `data` (s0011) scoped to its current component ID.
- `state`, `config`, and `secrets` are present and typed only when the component declares the corresponding capability.
- A state factory creates state for one component in one application runtime.
- Components never share state, and reusing a definition across runtimes creates independent state.
- A component receives the same state object for every handler invocation within its runtime.
- State persists across stop/start cycles of that runtime and has no persistent-storage semantics.
- Core context exposes Stelaro capabilities and preserves the component ID for scoped capabilities.

## Anticipated changes

- Further component ID rules, resources, templates, reloading, and state-concurrency helpers may be specified later.
- Context capabilities may represent per-request and per-session state.
