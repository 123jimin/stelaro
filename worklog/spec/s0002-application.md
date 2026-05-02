+++
id = "s0002"
title = "Application"
tags = ["application", "architecture", "lifecycle", "config", "logging"]
+++

## Related Specs

- s0001: High-Level Architecture
- s0003: Component
- s0004: Context
- s0006: Hot Module Replacement

## Behavior

- An application coordinates registered components.
- An application coordinates typed component calls.
- UNIMPLEMENTED An application coordinates lifecycle, configuration, and logging.
- Application definitions can be declared separately from creating the application runtime.
- Applications are created with `createApplication`.
- `createApplication` initializes state for each registered component that declares a state factory.

## Constraints

- Application behavior belongs to the core package.
- Application behavior must not depend on gateway-specific runtimes.
- Shared concerns stay with the application: lifecycle, configuration, logging, component registration, and typed calls.
- Application runtime state initialization must happen during `createApplication`, before any calls are dispatched.

## Anticipated Changes

- Gateway registration may be specified separately.
- Configuration loading may be specified separately.

## Dangers

- Mixing application behavior with gateway-specific routing can make the core package depend on external runtime protocols.
- Mixing reusable definition concerns with runtime state can make the public model confusing.
