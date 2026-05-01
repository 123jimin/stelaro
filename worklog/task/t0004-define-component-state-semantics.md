+++
id = "t0004"
title = "Define component state semantics"
status = "pending"
tags = ["component", "context", "application"]
modifies = ["s0001", "s0002", "s0003", "s0004", "s0005"]
blocked_by = []
+++

## Scope

- Define the approved behavior for component-local state.
- Specify how component state is declared, initialized, and made available to component behavior.
- Specify whether component state is scoped to an application runtime, a component definition, a request, or another boundary.
- Specify whether repeated calls within one application runtime observe shared mutable state.
- Align the web server counter example with the approved state semantics.
- Update affected specs with approved behavior, leaving `UNIMPLEMENTED` markers where behavior is specified but not implemented.

## Out of Scope

- Implementing runtime state storage unless explicitly approved when this task becomes active.
- State persistence across process restarts.
- State reset APIs.
- State preservation during Hot Module Replacement.
- Cross-process or distributed state behavior.
- Component lifecycle, logging, and configuration behavior beyond what is required to describe state boundaries.

## Notes

- The web server example already sketches a `state` capability on a component.
- `t0003` intentionally left component state behavior out of the core runtime.
- If the approved behavior requires implementation work, create or extend a follow-up task rather than presenting specification-only work as implemented.
