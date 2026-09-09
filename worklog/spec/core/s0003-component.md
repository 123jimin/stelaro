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
function defineComponent(definition: Component): Component;
```

## Behavior

- Component calls provide typed IPC-like boundaries without requiring
  cross-process transport.
- A handler may be a callable `(context, input) => ...` or an object with
  `handle(context, input)`; both dispatch identically.
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
- Call inputs and outputs MUST use Arktype schemas and remain typed through
  declaration, handler dispatch, and `context.call`.
- Components MAY depend on typed calls exposed by gateway components.

## Anticipated Changes

- Component id rules, resources, templates, reloading, HMR state migration,
  and state-concurrency helpers may be specified later.
