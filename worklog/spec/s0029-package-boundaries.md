+++
id = "s0029"
title = "Package Boundaries"
tags = ["architecture", "packages", "gateway"]
+++

## Behavior

- The core package owns application lifecycle, configuration, logging,
  component registration, and typed component calls.
- Gateway packages adapt external runtime entrypoints to Stelaro components by
  binding protocol triggers to typed component calls.
- Fastify and Discord gateways are publishable packages separate from core.
- Each gateway preserves its protocol's request and response concepts instead
  of conforming to a universal gateway model.

## Constraints

- Core MUST NOT depend on gateway runtimes; gateway packages MAY depend on core
  and their own external runtimes.
- Protocol-specific concerns MUST remain in the relevant gateway package.
- Non-gateway components MUST NOT require raw gateway runtime objects.
- Public design SHOULD NOT assume unspecified details for prompts, configuration,
  routes, commands, events, or component behavior.

## Anticipated Changes

- Additional gateway packages may be added.
- A command-line gateway may be added, but is not part of the current package
  set.
