+++
id = "s0003"
title = "Component"
tags = ["component", "architecture", "lifecycle", "config", "logging"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0002: Application
- s0004: Context
- s0006: Hot Module Replacement

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `handlers` entries should infer input/output types from the component's call declarations, and `uses` should constrain which references `call` accepts.

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
    readonly handlers: Record<ComponentCallName, {
        handle(context: ComponentContext, input: unknown): Promisable<unknown>;
    }>;
};

function defineComponentCalls(id: ComponentId, declarations: ComponentCallDeclarations): ComponentCalls;
function defineComponent(definition: Component): Component;
```

## Behavior

- Component call APIs support IPC-like usage without requiring cross-process transport.
- UNIMPLEMENTED Components may use gateway capabilities through typed component call APIs.
- Component state must be scoped to a single application runtime. A component definition reused across multiple application runtimes must have independent state per runtime.
- Component state must not be shared between different components within the same application runtime.
- Component state is ephemeral to the application runtime (the object returned by `createApplication`). State persists across stop/start cycles within one runtime. There is no persistent state model.

## Constraints

- Component behavior belongs to the core package.
- Component ids must be lowercase kebab-case.
- Component ids must be stable enough to serve as public identity within an application.
- Component call boundaries must remain typed.
- Component call input and output definitions must be Arktype schemas.
- Component behavior must not require raw gateway-specific runtime objects.
- Component behavior may depend on typed call APIs exposed by gateway components.

## Anticipated Changes

- Component id format rules may be relaxed or extended.
- Component resources and templates may be specified separately.
- Component reloading may be specified separately.
- State preservation across Hot Module Replacement may be specified separately.
- State concurrency helpers may be specified separately.

## Dangers

- Weak typing at component call boundaries would weaken component isolation.
- Treating component ids as mutable labels would make logging and call routing harder to reason about.
- Coupling component behavior to gateway protocols would make components harder to reuse.
- Blocking typed calls to gateway components would make legitimate outbound gateway workflows harder to express.
