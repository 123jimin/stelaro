+++
id = "s0002"
title = "Package Boundaries"
tags = ["architecture", "packages", "logging", "gateway"]
paths = ["packages/**"]
+++

# Package Boundaries

## Package responsibilities

- `packages/stelaro` owns application lifecycle, component registration, typed component calls, configuration, and the logging contract.
- `packages/stelaro-pino` adapts a caller-configured Pino logger to the core logging contract. See s0013 and s0014.
- Gateway packages adapt external runtime entrypoints to Stelaro components by binding protocol triggers to typed component calls (s0016).
- UNIMPLEMENTED `packages/stelaro-fastify` is a publishable gateway package separate from core (s0017).
- Each gateway preserves its protocol's request and response concepts instead of conforming to a universal gateway model.
- UNIMPLEMENTED `packages/stelaro-i18n` provides optional localization through structural reader and logger contracts (s0018).

## Dependency boundaries

- Core MUST NOT depend on Pino or the Pino adapter.
- The Pino adapter MAY depend on core and Pino.
- Structured logging backends belong in separate packages.
- Core MUST NOT depend on gateway runtimes or require raw gateway objects.
- Gateway packages MAY depend on core and their own external runtimes.
- Protocol-specific concerns MUST remain in the relevant gateway package.
- Non-gateway components MUST NOT require raw gateway runtime objects.
- Core MUST NOT depend on the i18n package, and the i18n package SHOULD NOT import or depend on core.
- Public design SHOULD NOT assume unspecified details for prompts, configuration, routes, commands, events, or component behavior.

## Anticipated changes

- Additional gateway packages may be added.
- A command-line gateway may be added, but is not part of the current package set.
