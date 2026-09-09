+++
id = "s0004"
title = "Context"
tags = ["context", "architecture", "component", "application", "logging", "config"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0004.

## Types

Types are shown at their widest readable form. Implementations MUST narrow
`call` to references declared by the component's `uses`, infer each call's
input and output, and expose optional fields only when declared.

```typescript
type ComponentContext = {
    readonly log: Logger;
    readonly data: DataAccess;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
    readonly state?: unknown;
    readonly config?: unknown;
    readonly secrets?: unknown;
};
```

## Behavior

- A component receives the same state object for every handler invocation
  within one application runtime.
- `log` is scoped to the current component id; `data` is always present.
- `state`, `config`, and `secrets` are present and typed only when the component
  declares the corresponding capability.
- UNIMPLEMENTED Context allows behavior to call typed APIs exposed by gateway
  components.

## Constraints

- Core context exposes Stelaro capabilities, not raw gateway runtime objects.
- Context preserves the current component id for scoped capabilities.
- Gateway capabilities are accessible only through typed component calls.

## Anticipated Changes

- Gateway or lifecycle packages may extend context. Per-request and per-session
  state may be represented through context capabilities.
