+++
id = "t0003"
title = "Implement minimal core application and component"
status = "active"
tags = ["application", "component", "context"]
modifies = ["s0001", "s0002", "s0003", "s0004", "s0005"]
blocked_by = []
+++

## Scope

- Implement the minimal approved core behavior for creating applications with `createApplication`.
- Implement the minimal approved core behavior for defining components with stable public ids.
- Implement component call surface definitions with `defineComponentCalls`.
- Implement call reference values so user code calls typed references instead of string keys.
- Implement typed component call APIs whose inputs and outputs are defined with Arktype schemas.
- Implement component dependency typing through explicitly declared used call surfaces.
- Implement typed component call dispatch within a single application without requiring cross-process transport.
- Provide component behavior with core runtime context for typed component calls.
- Update the web server API design sketch to use call reference values.
- Keep the implementation in the core package without adding gateway-specific runtime dependencies.

## Out of Scope

- Gateway package behavior.
- Gateway binding APIs.
- Fastify routes, Discord behavior, command-line behavior, or other external runtime entrypoints.
- Component state semantics, persistence, reset behavior, call serialization, or state preservation during Hot Module Replacement.
- Configuration file loading.
- Pino or other logger adapter behavior.
- Hot Module Replacement behavior.
- Changes to approved spec behavior without explicit user confirmation.

## TypeScript-like Signatures

```ts
import type {Promisable} from "@jiminp/tooltool";
import type {BaseType} from "arktype";

type ComponentId = string;
type ComponentCallName = string;

type ComponentCallSchema = BaseType<unknown>;

type ComponentCallDeclaration<
    TInputSchema extends ComponentCallSchema,
    TOutputSchema extends ComponentCallSchema,
> = {
    input: TInputSchema;
    output: TOutputSchema;
};

type ComponentCallDeclarationMap = Record<
    ComponentCallName,
    ComponentCallDeclaration<ComponentCallSchema, ComponentCallSchema>
>;

type ComponentCallReference<
    TId extends ComponentId,
    TCallName extends ComponentCallName,
    TInputSchema extends ComponentCallSchema,
    TOutputSchema extends ComponentCallSchema,
> = {
    componentId: TId;
    name: TCallName;
    input: TInputSchema;
    output: TOutputSchema;
};

type ComponentCallReferenceMap = Record<
    ComponentCallName,
    ComponentCallReference<ComponentId, ComponentCallName, ComponentCallSchema, ComponentCallSchema>
>;

type ComponentCallReferencesFor<
    TId extends ComponentId,
    TDeclarations extends ComponentCallDeclarationMap,
> = {
    [TCallName in keyof TDeclarations & ComponentCallName]: ComponentCallReference<
        TId,
        TCallName,
        TDeclarations[TCallName]["input"],
        TDeclarations[TCallName]["output"]
    >;
};

type ComponentCallsDefinition<
    TId extends ComponentId,
    TCalls extends ComponentCallReferenceMap,
> = {
    id: TId;
    calls: TCalls;
};

type AnyComponentCallsDefinition = ComponentCallsDefinition<ComponentId, ComponentCallReferenceMap>;

type ComponentCallReferenceFor<TCallsDefinition> = TCallsDefinition extends ComponentCallsDefinition<
    ComponentId,
    infer TCalls
>
    ? TCalls[keyof TCalls & ComponentCallName]
    : never;

type ComponentCallReferenceInput<TReference> = TReference extends {
    input: infer TInputSchema extends ComponentCallSchema;
}
    ? TInputSchema["inferIn"]
    : never;

type ComponentCallReferenceOutput<TReference> = TReference extends {
    output: infer TOutputSchema extends ComponentCallSchema;
}
    ? TOutputSchema["inferOut"]
    : never;

type ComponentCallContext<TUses extends readonly AnyComponentCallsDefinition[]> = {
    call<TReference extends ComponentCallReferenceFor<TUses[number]>>(
        reference: TReference,
        input: ComponentCallReferenceInput<TReference>,
    ): Promise<ComponentCallReferenceOutput<TReference>>;
};

type ComponentHandlerDefinition<
    TReference extends ComponentCallReference<ComponentId, ComponentCallName, ComponentCallSchema, ComponentCallSchema>,
    TUses extends readonly AnyComponentCallsDefinition[],
> = {
    handle(
        context: ComponentCallContext<TUses>,
        input: ComponentCallReferenceInput<TReference>,
    ): Promisable<ComponentCallReferenceOutput<TReference>>;
};

type ComponentHandlerMap<
    TCalls extends AnyComponentCallsDefinition,
    TUses extends readonly AnyComponentCallsDefinition[],
> = {
    [TCallName in keyof TCalls["calls"] & ComponentCallName]: ComponentHandlerDefinition<
        TCalls["calls"][TCallName],
        TUses
    >;
};

type ComponentDefinition<
    TCalls extends AnyComponentCallsDefinition,
    TUses extends readonly AnyComponentCallsDefinition[],
> = {
    calls: TCalls;
    uses: TUses;
    handlers: ComponentHandlerMap<TCalls, TUses>;
};

type AnyComponentDefinition = ComponentDefinition<
    AnyComponentCallsDefinition,
    readonly AnyComponentCallsDefinition[]
>;

type ProvidedComponentCallsFor<TComponent> = TComponent extends ComponentDefinition<
    infer TCalls,
    readonly AnyComponentCallsDefinition[]
>
    ? TCalls
    : never;

type ApplicationCallReferenceFor<TComponents extends readonly AnyComponentDefinition[]> = ComponentCallReferenceFor<
    ProvidedComponentCallsFor<TComponents[number]>
>;

type ApplicationDefinition<TComponents extends readonly AnyComponentDefinition[]> = {
    components: TComponents;
};

type Application<TComponents extends readonly AnyComponentDefinition[]> = {
    call<TReference extends ApplicationCallReferenceFor<TComponents>>(
        reference: TReference,
        input: ComponentCallReferenceInput<TReference>,
    ): Promise<ComponentCallReferenceOutput<TReference>>;
};

declare function defineComponentCalls<
    const TId extends ComponentId,
    const TDeclarations extends ComponentCallDeclarationMap,
>(definition: {
    id: TId;
    calls: TDeclarations;
}): ComponentCallsDefinition<TId, ComponentCallReferencesFor<TId, TDeclarations>>;

declare function defineComponent<
    const TCalls extends AnyComponentCallsDefinition,
    const TUses extends readonly AnyComponentCallsDefinition[],
>(definition: ComponentDefinition<TCalls, TUses>): ComponentDefinition<TCalls, TUses>;

declare function createApplication<
    const TComponents extends readonly AnyComponentDefinition[],
>(definition: ApplicationDefinition<TComponents>): Application<TComponents>;
```

## Type Narrowing Demonstration

```ts
import {assertEqualType} from "@jiminp/tooltool";

declare const emptySchema: BaseType<{}>;
declare const setCounterSchema: BaseType<{count: number}>;
declare const counterOutputSchema: BaseType<{count: number}>;
declare const htmlInputSchema: BaseType<{}>;
declare const htmlOutputSchema: BaseType<{html: string}>;

const CounterCalls = defineComponentCalls({
    id: "counter",
    calls: {
        current: {
            input: emptySchema,
            output: counterOutputSchema,
        },
        set: {
            input: setCounterSchema,
            output: counterOutputSchema,
        },
    },
});

assertEqualType<
    ComponentCallReferenceInput<typeof CounterCalls.calls.current>,
    {}
>();
assertEqualType<
    ComponentCallReferenceInput<typeof CounterCalls.calls.set>,
    {count: number}
>();
assertEqualType<
    ComponentCallReferenceOutput<typeof CounterCalls.calls.current>,
    {count: number}
>();
assertEqualType<
    ComponentCallReferenceOutput<typeof CounterCalls.calls.set>,
    {count: number}
>();

const counter = defineComponent({
    calls: CounterCalls,
    uses: [],
    handlers: {
        current: {
            handle() {
                return {count: 0};
            },
        },
        set: {
            handle(_context, input) {
                assertEqualType<typeof input, {count: number}>();

                return {count: input.count};
            },
        },
    },
});

const PageCalls = defineComponentCalls({
    id: "page",
    calls: {
        render: {
            input: htmlInputSchema,
            output: htmlOutputSchema,
        },
    },
});

const page = defineComponent({
    calls: PageCalls,
    uses: [CounterCalls],
    handlers: {
        render: {
            async handle({call}) {
                const {count} = await call(CounterCalls.calls.current, {});

                return {html: String(count)};
            },
        },
    },
});

type Components = readonly [typeof counter, typeof page];

declare const app: Application<Components>;

await app.call(CounterCalls.calls.current, {});
await app.call(CounterCalls.calls.set, {count: 1});

// @ts-expect-error `counter.set` requires `{count: number}` input.
await app.call(CounterCalls.calls.set, {});

declare const stringReference: string;

// @ts-expect-error user code calls references, not string keys.
await app.call(stringReference, {});
```

## Potential `@jiminp/tooltool` Utilities

- `Promisable<T>` may be used for component call handlers that can return either synchronous or asynchronous outputs.
- `assertEqualType<T, U>()` may be used in type-focused tests for inferred component call references, inputs, and outputs.
- `OptionalIfVoid<T>` may be considered later if a component call input schema can represent omitted input, but current approved behavior only requires schema-defined inputs.
- `JSONValue`, `JSONObject`, `RecursivePartial<T>`, `Nullable<T>`, and `Result<T, E>` are not needed for this minimal task unless approved configuration, patching, nullable, or explicit result-returning behavior is added.
- If core package source imports `@jiminp/tooltool`, add it to the core package dependencies rather than relying only on the workspace root dependency.

## Notes

- Tests must be written from s0001, s0002, s0003, and s0004 before implementation.
- If implementation requires component state, lifecycle, configuration, or logging behavior beyond the approved specs, pause and request explicit spec approval first.
- The TypeScript-like signatures are a design target for the task. Exact Arktype type names and helper type implementations must be chosen by surveying the installed Arktype package during implementation.
- Component call input/output helper types should stay schema-derived without relying on wildcard schema type parameters.
- Component behavior should receive `call` typed from declared used call surfaces, avoiding circular dependence on the final application registry.
- Public call sites should use call reference values such as `CounterCalls.calls.current`, not string keys.
