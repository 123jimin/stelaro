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

## Behavior

- Components have stable public ids.
- Component ids are used for component identity.
- UNIMPLEMENTED Component ids are used for component-scoped logging.
- Components expose typed call APIs.
- Component call API inputs and outputs are defined with Arktype schemas.
- Component call APIs support IPC-like usage without requiring cross-process transport.
- UNIMPLEMENTED Components may use gateway capabilities through typed component call APIs.
- Components may declare an optional state factory that returns the component's initial state.
- Components that declare a state factory receive their state object through handler context.
- Components that do not declare a state factory have no state and do not receive state in context.

## Constraints

- Component behavior belongs to the core package.
- Component ids must be stable enough to serve as public identity within an application.
- Component call boundaries must remain typed.
- Component call input and output definitions must be Arktype schemas.
- Component behavior must not require raw gateway-specific runtime objects.
- Component behavior may depend on typed call APIs exposed by gateway components.
- Component state must be scoped to a single application runtime. A component definition reused across multiple application runtimes must have independent state per runtime.
- Component state must not be shared between different components within the same application runtime.
- Component state is ephemeral to the application runtime. There is no persistent state model.

## Anticipated Changes

- Component lifecycle may be specified separately.
- Component configuration may be specified separately.
- Component resources and templates may be specified separately.
- Component reloading may be specified separately.
- State preservation across Hot Module Replacement may be specified separately.
- State concurrency helpers may be specified separately.

## Dangers

- Weak typing at component call boundaries would undermine Peranto's main design goal.
- Treating component ids as mutable labels would make logging and call routing harder to reason about.
- Coupling component behavior to gateway protocols would make components harder to reuse.
- Blocking typed calls to gateway components would make legitimate outbound gateway workflows harder to express.
