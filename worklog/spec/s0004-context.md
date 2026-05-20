+++
id = "s0004"
title = "Context"
tags = ["context", "architecture", "component", "application", "logging", "config"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0002: Application
- s0003: Component

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `call` accepts only references from the component's `uses` declarations, with input/output types inferred from the reference.

```typescript
type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

type LoggerFactory = (component_id: ComponentId) => Logger;

type ComponentContext = {
    readonly log: Logger;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
    readonly state?: unknown;       // present iff component declares a state factory
    readonly config?: unknown;      // present iff component declares a config schema
};
```

## Behavior

- UNIMPLEMENTED Context allows behavior to call typed APIs exposed by gateway components.
- Context must provide the same state object reference to all handler invocations of a given component within one application runtime.

## Constraints

- Core context provides Stelaro-level capabilities, not raw gateway runtime objects.
- Core context preserves the current component id for scoped capabilities such as logging and configuration.
- Core context may access gateway capabilities only through typed component call APIs.

## Anticipated Changes

- Gateway-specific contexts may extend core context in gateway packages.
- Lifecycle-specific context extensions may be specified separately.
- Resource and template access through context may be specified separately.
- Per-request and per-session state may be represented through context capabilities.

## Dangers

- Putting every runtime concern into context can make behavior dependencies unclear.
- Exposing gateway-specific protocol objects through core context would couple core behavior to external runtimes.
- Allowing unvalidated configuration through context would weaken typed component boundaries.
- Preventing context from calling typed gateway APIs would block cross-gateway workflows.
