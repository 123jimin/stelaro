+++
id = "s0001"
title = "High-Level Architecture"
tags = ["architecture", "component", "gateway", "logging", "config"]
+++

## Design Phase Note

- Peranto is currently in the design phase.
- During the design phase, worklog rules about spec absoluteness apply more weakly to exploratory details such as constraints and dangers.
- Design-phase constraints and dangers should be read skeptically while the architecture is still being refined.
- Even during the design phase, editing spec behavior or intentionally diverging from a spec requires explicit user confirmation.

## Behavior

### Peranto

- UNIMPLEMENTED Peranto is an opinionated component system for applications that may include web servers, Discord bots, command-line entrypoints, and other external runtime entrypoints.

### Application

- UNIMPLEMENTED An application coordinates registered components, lifecycle, configuration, logging, and typed component calls.
- UNIMPLEMENTED Applications are created with `createApplication`.

### Component

- UNIMPLEMENTED Components have stable public ids.
- UNIMPLEMENTED Component ids are used for component identity and component-scoped logging.
- UNIMPLEMENTED Components expose typed call APIs.
- UNIMPLEMENTED Component call API inputs and outputs are defined with Arktype schemas.
- UNIMPLEMENTED Component call APIs support IPC-like usage without requiring cross-process transport.

### Gateway

- UNIMPLEMENTED Gateway components adapt external runtime entrypoints to Peranto components.
- UNIMPLEMENTED Fastify and Discord gateways are separate publishable packages from the core package.
- UNIMPLEMENTED Gateway behavior is unified around binding external triggers to typed component calls.
- UNIMPLEMENTED Gateway APIs preserve protocol-specific request and response concepts rather than forcing every gateway into one universal request model.
- UNIMPLEMENTED Gateway components may expose typed call APIs for outbound protocol capabilities.
- UNIMPLEMENTED Non-gateway components may use gateway capabilities through typed component call APIs.

### Logging

- UNIMPLEMENTED Logging supports component-scoped identity derived from component ids.

### Validation

- UNIMPLEMENTED Arktype is a core validation and typing tool for Peranto boundaries.

## Constraints

- The core package must not depend on gateway-specific runtimes.
- Gateway packages may depend on the core package and their own external runtime ecosystems.
- Component ids must be stable enough to serve as public identity within an application.
- Component call input and output definitions must be Arktype schemas.
- The architecture must keep shared concerns in core: lifecycle, configuration, logging, component registration, and typed calls.
- Protocol-specific concerns must stay with the relevant gateway package.
- Non-gateway components must not require raw gateway-specific runtime objects.
- Public design must not assume unprovided details for prompts, configuration, routes, commands, events, or component behavior.

## Anticipated Changes

- Additional gateway packages may be added after the Fastify and Discord packages.
- Command-line gateway support may be added later, but it is not part of the current package set.
- Component resource/template support is expected to be defined.
- Component reloading is expected to be defined.
- The configuration file format is expected to be chosen separately.
- Gateway packages are expected to define protocol-native binding helpers.

## Dangers

- Over-unifying gateways can hide important differences between HTTP, Discord interactions, command-line execution, and future runtimes.
- Adding gateway runtime dependencies to core would make unrelated applications pay for unused integrations.
- Weak typing at call or gateway boundaries would undermine Peranto's main design goal.
- Treating component ids as mutable labels would make logging and routing harder to reason about.
- Centralizing all external routing in gateway components can make applications harder to compose.
- Blocking typed access to gateway capabilities would make cross-gateway workflows harder to model.

## Proposals

- Application APIs may later separate reusable application definition from runtime creation.
- Reusable component and gateway declarations may use definition-oriented public names.
- TOML may be a good default authoring format for configuration, with parsed data validated through Arktype.
