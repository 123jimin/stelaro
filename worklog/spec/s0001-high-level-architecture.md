+++
id = "s0001"
title = "High-Level Architecture"
tags = ["architecture", "component", "gateway", "logging", "config"]
+++

## Related Specs

- s0002: Application
- s0003: Component
- s0004: Context
- s0006: Hot Module Replacement
- s0010: Examples (Common)
- s0026: Localization

## Design Phase Note

- Stelaro is currently in the design phase.
- During the design phase, worklog rules about spec absoluteness apply more weakly to exploratory details such as constraints and dangers.
- Design-phase constraints and dangers should be read skeptically while the architecture is still being refined.
- Even during the design phase, editing spec behavior or intentionally diverging from a spec requires explicit user confirmation.

## Behavior

### Stelaro

- Stelaro is an opinionated component system for applications that may include web servers, Discord bots, command-line entrypoints, and other external runtime entrypoints.
- Stelaro's goal is maintainability: each part of an application can be understood and changed independently, even as the application grows. It achieves this through components with enforced boundaries — typed call schemas, explicit dependency declarations, and scoped configuration.

### Application

- An application coordinates registered components and typed component calls.
- An application coordinates lifecycle (start/stop).
- An application coordinates configuration.
- An application coordinates logging.
- Application definitions can be declared separately from creating the application runtime.
- Applications are created with `createApplication`.

### Component

- Components have stable public ids.
- Component ids are used for component identity.
- Component ids are used for component-scoped logging.
- Component behavior receives logging scoped to the component id.
- Components expose typed call APIs.
- Component call API inputs and outputs are defined with Arktype schemas.
- Component call APIs support IPC-like usage without requiring cross-process transport.
- Components may declare local state that is created per application runtime and accessible through handler context.

### Gateway

- Gateway components adapt external runtime entrypoints to Stelaro components.
- Fastify and Discord gateways are separate publishable packages from the core package.
- Gateway behavior is unified around binding external triggers to typed component calls.
- Gateway APIs preserve protocol-specific request and response concepts rather than forcing every gateway into one universal request model.
- UNIMPLEMENTED Gateway components may expose typed call APIs for outbound protocol capabilities.
- UNIMPLEMENTED Non-gateway components may use gateway capabilities through typed component call APIs.

### Logging

- Logging supports component-scoped identity derived from component ids.
- Loggers support debug, info, warn, and error calls with arbitrary log arguments.
- Application definitions may provide a logger factory for component-scoped loggers.
- When no logger factory is provided, core uses a default console logger.
- The default console logger prefixes output with the component id and maps debug, info, warn, and error messages to the matching console methods.

### Localization

- Localization supports component-scoped translation: each component owns its message catalog, keyed by its id.
- Translation resolves a message for an explicit locale; the locale is always an explicit argument, never ambient, because components have no request context.
- A translator falls back requested locale → default locale → the message's source text, so a missing translation always yields readable source.
- Application definitions may provide a translator factory; when none is provided, core uses a default source translator that returns the source message.
- Message catalogs are per-component and opt-in by presence; a component without catalogs uses source text. See s0026 and s0027.

### Validation

- Arktype is a core validation and typing tool for Stelaro boundaries.

## Constraints

- The core package must not depend on gateway-specific runtimes.
- Gateway packages may depend on the core package and their own external runtime ecosystems.
- Component ids must be stable enough to serve as public identity within an application.
- Component call input and output definitions must be Arktype schemas.
- The architecture must keep shared concerns in core: lifecycle, configuration, logging, localization, component registration, and typed calls.
- Protocol-specific concerns must stay with the relevant gateway package.
- Non-gateway components must not require raw gateway-specific runtime objects.
- Public design must not assume unprovided details for prompts, configuration, routes, commands, events, or component behavior.

## Anticipated Changes

- Additional gateway packages may be added after the Fastify and Discord packages.
- Command-line gateway support may be added later, but it is not part of the current package set.
- Component resource/template support is expected to be defined.
- Component reloading is expected to be defined.
- Gateway packages are expected to define protocol-native binding helpers.
- Log output may be routed to pluggable transports — a file, an aggregation backend, or a database sink — without changing how behavior emits logs, so persistence and shipping stay additive.

## Dangers

- Over-unifying gateways can hide important differences between HTTP, Discord interactions, command-line execution, and future runtimes.
- Adding gateway runtime dependencies to core would make unrelated applications pay for unused integrations.
- Weak typing at call or gateway boundaries would weaken component isolation.
- Treating component ids as mutable labels would make logging and routing harder to reason about.
- Centralizing all external routing in gateway components can make applications harder to compose.
- Blocking typed access to gateway capabilities would make cross-gateway workflows harder to model.

## Proposals

- Reusable component and gateway declarations may use definition-oriented public names.
- TOML is the default authoring format for configuration, with parsed data validated through Arktype.
