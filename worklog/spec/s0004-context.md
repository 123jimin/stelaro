+++
id = "s0004"
title = "Context"
tags = ["context", "architecture", "component", "application", "logging", "config"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0002: Application
- s0003: Component

## Behavior

- Context provides runtime capabilities to Peranto behavior.
- Component behavior receives context from the application runtime.
- Context includes access to component-scoped logging.
- Component-scoped logging is available to handlers and lifecycle hooks through the same context object.
- Context includes access to typed component calls.
- Context includes access to validated configuration relevant to the receiving behavior.
- UNIMPLEMENTED Context allows behavior to call typed APIs exposed by gateway components.
- Context includes access to component state for components that declare a state factory.
- Lifecycle hooks (`start`, `stop`) receive the same context as handlers.

## Constraints

- Core context is defined by the core package and is available to core component behavior.
- Core context provides Peranto-level capabilities, not raw gateway runtime objects.
- Core context preserves the current component id for scoped capabilities such as logging and configuration.
- Core context exposes validated configuration to behavior.
- Core context may access gateway capabilities only through typed component call APIs.
- Context must provide the same state object reference to all handler invocations of a given component within one application runtime.
- Context must not provide state to components that did not declare a state factory.

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
