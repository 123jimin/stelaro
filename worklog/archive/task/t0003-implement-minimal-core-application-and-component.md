+++
id = "t0003"
title = "Implement minimal core application and component"
status = "done"
tags = ["application", "component", "context"]
modifies = ["s0001", "s0002", "s0003", "s0004", "s0010"]
blocked_by = []
+++

## Scope

- Implement the minimal approved core behavior for creating applications with `createApplication`.
- Implement reusable application definition with `defineApplication`.
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

type ComponentId = string;
type ComponentCallName = string;
type ComponentCallSchema = {
    readonly inferIn: unknown;
    readonly infer: unknown;
    assert(input: unknown): this["infer"];
};
type ValueOf<T extends object> = T extends unknown ? T[keyof T] : never;

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

type AnyComponentCallReference = ComponentCallReference<
    ComponentId,
    ComponentCallName,
    ComponentCallSchema,
    ComponentCallSchema
>;

type ComponentCallDeclarations = Record<
    ComponentCallName,
    {
        input: ComponentCallSchema;
        output: ComponentCallSchema;
    }
>;

type ComponentCalls<
    TId extends ComponentId,
    TDeclarations extends ComponentCallDeclarations,
> = {
    id: TId;
    calls: {
        [TCallName in keyof TDeclarations & ComponentCallName]: ComponentCallReference<
            TId,
            TCallName,
            TDeclarations[TCallName]["input"],
            TDeclarations[TCallName]["output"]
        >;
    };
};

type AnyComponentCalls = ComponentCalls<ComponentId, ComponentCallDeclarations>;

type CallFrom<TCalls extends AnyComponentCalls> = ValueOf<TCalls["calls"]>;

type CallInput<TCall extends AnyComponentCallReference> = TCall["input"]["inferIn"];
type CallOutput<TCall extends AnyComponentCallReference> = TCall["output"]["infer"];

type ComponentContext<TUses extends readonly AnyComponentCalls[]> = {
    call<TCall extends CallFrom<TUses[number]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
};

type Component<
    TCalls extends AnyComponentCalls,
    TUses extends readonly AnyComponentCalls[],
> = {
    calls: TCalls;
    uses: TUses;
    handlers: {
        [TCallName in keyof TCalls["calls"] & ComponentCallName]: {
            handle(
                context: ComponentContext<TUses>,
                input: CallInput<TCalls["calls"][TCallName]>,
            ): Promisable<CallOutput<TCalls["calls"][TCallName]>>;
        };
    };
};

type AnyComponent = Component<AnyComponentCalls, readonly AnyComponentCalls[]>;

type ApplicationDefinition<TComponents extends readonly AnyComponent[]> = {
    components: TComponents;
};

type Application<TComponents extends readonly AnyComponent[]> = {
    call<TCall extends CallFrom<TComponents[number]["calls"]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
};

declare function defineComponentCalls<
    const TId extends ComponentId,
    const TDeclarations extends ComponentCallDeclarations,
>(definition: {
    id: TId;
    calls: TDeclarations;
}): ComponentCalls<TId, TDeclarations>;

declare function defineComponent<
    const TCalls extends AnyComponentCalls,
    const TUses extends readonly AnyComponentCalls[],
>(definition: Component<TCalls, TUses>): Component<TCalls, TUses>;

declare function defineApplication<
    const TComponents extends readonly AnyComponent[],
>(definition: ApplicationDefinition<TComponents>): ApplicationDefinition<TComponents>;

declare function createApplication<
    const TComponents extends readonly AnyComponent[],
>(definition: ApplicationDefinition<TComponents>): Application<TComponents>;
```

## Type Narrowing Demonstration

```ts
import {assertEqualType} from "@jiminp/tooltool";

declare const EmptySchema: ComponentCallSchema & {
    readonly inferIn: {};
    readonly infer: {};
};
declare const SetCounterSchema: ComponentCallSchema & {
    readonly inferIn: {count: number};
    readonly infer: {count: number};
};
declare const CounterOutputSchema: ComponentCallSchema & {
    readonly inferIn: {count: number};
    readonly infer: {count: number};
};
declare const HtmlInputSchema: ComponentCallSchema & {
    readonly inferIn: {};
    readonly infer: {};
};
declare const HtmlOutputSchema: ComponentCallSchema & {
    readonly inferIn: {html: string};
    readonly infer: {html: string};
};

const CounterCalls = defineComponentCalls({
    id: "counter",
    calls: {
        current: {
            input: EmptySchema,
            output: CounterOutputSchema,
        },
        increment: {
            input: EmptySchema,
            output: CounterOutputSchema,
        },
        set: {
            input: SetCounterSchema,
            output: CounterOutputSchema,
        },
    },
});

assertEqualType<
    CallInput<typeof CounterCalls.calls.current>,
    {}
>();
assertEqualType<
    CallInput<typeof CounterCalls.calls.set>,
    {count: number}
>();
assertEqualType<
    CallOutput<typeof CounterCalls.calls.current>,
    {count: number}
>();
assertEqualType<
    CallOutput<typeof CounterCalls.calls.set>,
    {count: number}
>();

const CounterComponent = defineComponent({
    calls: CounterCalls,
    uses: [],
    handlers: {
        current: {
            handle() {
                return {count: 0};
            },
        },
        increment: {
            handle() {
                return {count: 1};
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
            input: HtmlInputSchema,
            output: HtmlOutputSchema,
        },
    },
});

const PageComponent = defineComponent({
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

const CounterPageApp = defineApplication({
    components: [
        CounterComponent,
        PageComponent,
    ],
});

const app = createApplication(CounterPageApp);

await app.call(CounterCalls.calls.current, {});
await app.call(CounterCalls.calls.increment, {});
await app.call(CounterCalls.calls.set, {count: 1});

// @ts-expect-error `counter.set` requires `{count: number}` input.
await app.call(CounterCalls.calls.set, {});

declare const string_reference: string;

// @ts-expect-error user code calls references, not string keys.
await app.call(string_reference, {});
```

## Potential `@jiminp/tooltool` Utilities

- `Promisable<T>` is exported by `@jiminp/tooltool` and should be used for component call handlers that can return either synchronous or asynchronous outputs.
- `assertEqualType<T, U>()` may be used in type-focused tests for inferred component call references, inputs, and outputs.
- `OptionalIfVoid<T>` may be considered later if a component call input schema can represent omitted input, but current approved behavior only requires schema-defined inputs.
- `JSONValue`, `JSONObject`, `RecursivePartial<T>`, `Nullable<T>`, and `Result<T, E>` are not needed for this minimal task unless approved configuration, patching, nullable, or explicit result-returning behavior is added.

## Notes

- Tests must be written from s0001, s0002, s0003, and s0004 before implementation.
- If implementation requires component state, lifecycle, configuration, or logging behavior beyond the approved specs, pause and request explicit spec approval first.
- The TypeScript-like signatures are a design target for the task. Exact Arktype type names and helper type implementations must be chosen by surveying the installed Arktype package during implementation.
- The web server example also sketches `state`, `logger`, and Fastify gateway context. Those remain out of t0003 unless their behavior is explicitly approved.
- Arktype exposes `inferIn` for accepted input and `infer` for validated output; the implementation should use those inference properties for call typing.
- Component call input/output helper types should stay schema-derived without relying on wildcard schema type parameters.
- Component behavior should receive `call` typed from declared used call surfaces, avoiding circular dependence on the final application registry.
- Public call sites should use call reference values such as `CounterCalls.calls.current`, not string keys.

## Implementation Notes

- Core implementation exports `defineComponentCalls`, `defineComponent`, `defineApplication`, and `createApplication`.
- Component definitions and call-surface helpers live in `packages/peranto/src/component.ts`; the package entrypoint re-exports them.
- Application definitions and runtime dispatch live in `packages/peranto/src/application.ts`; the package entrypoint re-exports them.
- Application runtime dispatch validates call inputs and outputs with the declared schemas.
- Component context calls are limited to the call surfaces declared in `uses`.
- Verification through `pnpm --filter @jiminp/peranto test` is currently blocked before test execution by a local Node CSPRNG assertion in the Codex command runner.
