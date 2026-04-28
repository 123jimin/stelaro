+++
id = "s0002"
title = "Application"
tags = ["application", "architecture", "lifecycle", "config", "logging"]
+++

## Behavior

- UNIMPLEMENTED An application coordinates registered components.
- UNIMPLEMENTED An application coordinates lifecycle, configuration, logging, and typed component calls.
- UNIMPLEMENTED Applications are created with `createApplication`.

## Constraints

- Application behavior belongs to the core package.
- Application behavior must not depend on gateway-specific runtimes.
- Shared concerns stay with the application: lifecycle, configuration, logging, component registration, and typed calls.

## Anticipated Changes

- Application definition and runtime creation may be specified separately.
- Gateway registration may be specified separately.
- Configuration loading may be specified separately.

## Dangers

- Mixing application behavior with gateway-specific routing can make the core package depend on external runtime protocols.
- Mixing reusable definition concerns with runtime state can make the public model confusing.
