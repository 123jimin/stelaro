+++
id = "s0003"
title = "Component"
tags = ["component", "architecture", "lifecycle", "config", "logging"]
+++

## Behavior

- UNIMPLEMENTED Components have stable public ids.
- UNIMPLEMENTED Component ids are used for component identity and component-scoped logging.
- UNIMPLEMENTED Components expose typed call APIs.
- UNIMPLEMENTED Component call APIs support IPC-like usage without requiring cross-process transport.
- UNIMPLEMENTED Components may use gateway capabilities through typed component call APIs.

## Constraints

- Component behavior belongs to the core package.
- Component ids must be stable enough to serve as public identity within an application.
- Component call boundaries must remain typed.
- Component behavior must not require raw gateway-specific runtime objects.
- Component behavior may depend on typed call APIs exposed by gateway components.

## Anticipated Changes

- Component lifecycle may be specified separately.
- Component configuration may be specified separately.
- Component resources and templates may be specified separately.
- Component reloading may be specified separately.

## Dangers

- Weak typing at component call boundaries would undermine Peranto's main design goal.
- Treating component ids as mutable labels would make logging and call routing harder to reason about.
- Coupling component behavior to gateway protocols would make components harder to reuse.
- Blocking typed calls to gateway components would make legitimate outbound gateway workflows harder to express.
