+++
id = "s0005"
title = "Components"
tags = ["architecture", "component", "context", "lifecycle", "config", "logging"]
paths = ["packages/stelaro/src/component/**"]
+++

# Components

## Declaration types

Call surfaces preserve each component ID, call name, and concrete input and output schema type.
The `AnyComponentCallReference` and `AnyComponentCalls` aliases express the widest forms.

```typescript
type ComponentId = string;
type ComponentCallName = string;

interface ComponentCallSchema extends Schema {
    readonly inferIn: unknown;
}

type ComponentCallReference<
    TId extends ComponentId,
    TName extends ComponentCallName,
    TInput extends ComponentCallSchema,
    TOutput extends ComponentCallSchema,
> = {
    readonly component_id: TId;
    readonly name: TName;
    readonly input: TInput;
    readonly output: TOutput;
};

type AnyComponentCallReference = ComponentCallReference<
    ComponentId, ComponentCallName, ComponentCallSchema, ComponentCallSchema
>;

type ComponentCallDeclarations = Readonly<Record<ComponentCallName, {
    readonly input: ComponentCallSchema;
    readonly output: ComponentCallSchema;
}>>;

type ComponentCalls<
    TId extends ComponentId,
    TReferences extends Readonly<Record<ComponentCallName, AnyComponentCallReference>>,
> = {
    readonly id: TId;
    readonly calls: TReferences;
};

type AnyComponentCalls = ComponentCalls<ComponentId, Readonly<Record<ComponentCallName, AnyComponentCallReference>>>;

// Factory return types are shown at their widest.
function defineComponentCalls(id: ComponentId, declarations: ComponentCallDeclarations): AnyComponentCalls;
function mergeComponentCalls(first: AnyComponentCalls, ...rest: AnyComponentCalls[]): AnyComponentCalls;
const EmptyInput: ComponentCallSchema;
interface LocalSchema<T> extends ComponentCallSchema {
    readonly infer: T;
    readonly inferIn: T;
}
function defineLocalInput<T>(): LocalSchema<T>;
function defineLocalOutput<T>(): LocalSchema<T>;
function isLocalSchema(call_schema: ComponentCallSchema): boolean;

type StateFactory<TState> = () => TState;
type ComponentCallHandler<TContext, TInput, TOutput> =
    | ((context: TContext, input: TInput) => Promisable<TOutput>)
    | { handle(context: TContext, input: TInput): Promisable<TOutput> };
```

- `MergedCallReferences<TSurfaces>` combines the call maps from the known entries in a tuple of surfaces.
  `MergedComponentCalls<TSurfaces>` pairs that map with the component ID.
- `CallFrom<TCalls>` selects the union of references in a call surface.
- `CallInput<TCall>` selects the caller's input before validation. `CallOutput<TCall>` selects the output after validation.
- `ComponentCallFn<TUses>` describes a call function that accepts a reference from the listed surfaces and infers its caller input and result.
- `StateFactory<TState>` describes a per-instance state initializer.
  `ComponentCallHandler<TContext, TInput, TOutput>` describes either handler form, with validated input and output before validation.

## Component definitions

- `defineComponent` returns the supplied definition with types inferred from its declarations.
- Components declare configuration and secrets independently through the optional `config` and `secrets` fields.
  Each field holds an ArkType schema. See s0009 for loading and validation.
- Each handler receives its input schema's validated type and returns a value accepted by its output schema.
- Handlers and lifecycle hooks share the component's context type.
  The type exposes `log`, `data`, and `call`, with `state`, `config`, and `secrets` included only for declared capabilities.
  State is typed from its factory's return value, and configuration and secrets are typed from the outputs of their schemas.
- The type of `context.call` accepts only references from `uses` and infers the supplied input and validated result for each reference.
- `AnyComponent` describes a component whose concrete handler and hook parameter types are erased.

The excerpts below show the widest forms.

```typescript
type Component = {
    readonly calls: AnyComponentCalls;
    readonly uses: readonly AnyComponentCalls[];
    readonly config?: type.Any<unknown>;
    readonly secrets?: type.Any<unknown>;
    readonly state?: StateFactory<unknown>;
    readonly start?: (context: ComponentContext) => Promisable<void>;
    readonly stop?: (context: ComponentContext) => Promisable<void>;
    readonly onConfigReload?: (context: ComponentContext) => Promisable<void>;
    readonly handlers: Record<ComponentCallName, ComponentCallHandler<ComponentContext, unknown, unknown>>;
};

type ComponentContext = {
    readonly log: Logger;
    readonly data: DataAccess;
    readonly call: ComponentCallFn<readonly AnyComponentCalls[]>;
    readonly state?: unknown;
    readonly config?: unknown;
    readonly secrets?: unknown;
};

function defineComponent(definition: Component): Component;
```

## Call declarations

- Component calls provide typed IPC-like boundaries without requiring cross-process transport.
- Component IDs MUST be stable, lowercase kebab-case public identities.
  - IDs contain nonempty segments of lowercase ASCII letters and digits separated by single hyphens.
  - An invalid ID throws `InvalidComponentIdError` with `component_id`.
- Call names SHOULD be camelCase.
- `mergeComponentCalls` combines surfaces for the same component ID, such as a public surface and an internal surface.
  - It preserves each input reference and its type.
  - `MismatchedComponentIdError` reports the first surface's `expected_component_id` and the conflicting `actual_component_id`.
  - `DuplicateCallError` reports the `component_id` and duplicated `call_name`.
- Call declarations MUST use ArkType schemas or local schemas for inputs and outputs.
- `EmptyInput` accepts only plain objects with no own keys.
- `defineLocalInput<T>()` and `defineLocalOutput<T>()` create schemas for values that stay in the process.
  - The schemas' `assert` methods return the supplied value unchanged.
  - `isLocalSchema` detects schemas from either factory.

## Call handling

- A handler may be a function `(context, input) => ...` or an object with `handle(context, input)`. Both forms dispatch identically.
- Inputs and outputs remain typed through handler dispatch and `context.call`.
- Dispatch passes local values through without checking them.

### Local-value cleanup

- The component that creates a local value disposes of it.
  - A handler may keep a local input after the call returns.
  - The caller's component stops first, so it withdraws the input in its stop hook when the input must not be used after that.

## Context and state

- `context.call` accepts the references declared in `uses`.
  - A call to a reference absent from `uses` receives `UndeclaredCallError`.
  - Start and stop hooks may call dependencies that are still active. See s0006 for lifecycle guards.
- Every component receives `log` (s0013) and `data` (s0011) scoped to its current component ID.
- `state`, `config`, and `secrets` are present and typed only when the component declares the corresponding capability.
- A state factory creates state for one component in one application runtime.
- Components never share state, and reusing a definition across runtimes creates independent state.
- A component receives the same state object for every handler invocation within its runtime.
- State persists across stop/start cycles of that runtime and has no persistent-storage semantics.
- Core context exposes Stelaro capabilities and preserves the component ID for scoped capabilities.

## Gateway integration

- UNIMPLEMENTED Components may use gateway capabilities through typed component calls.
- UNIMPLEMENTED Context allows behavior to call typed APIs exposed by gateway components.

### Constraints

- Components MAY depend on typed calls exposed by gateway components.
- Gateway capabilities are accessible only through typed component calls.
- Component behavior belongs to core and MUST NOT require raw gateway objects.
- Core context exposes no raw gateway runtime objects.

## Anticipated changes

- Further component ID rules, resources, templates, reloading, HMR state migration, and state-concurrency helpers may be specified later.
- Gateway or lifecycle packages may extend context.
- Context capabilities may represent per-request and per-session state.
