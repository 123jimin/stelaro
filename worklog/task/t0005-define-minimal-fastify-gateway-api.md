+++
id = "t0005"
title = "Define minimal Fastify gateway API"
status = "pending"
tags = ["gateway", "application", "component", "examples"]
modifies = ["s0001", "s0004", "s0005"]
blocked_by = []
+++

## Scope

- Define the minimal approved Fastify gateway behavior needed by the web server example.
- Specify how external HTTP requests bind to typed Peranto component calls.
- Specify what gateway-specific request and response concepts belong in the Fastify package instead of the core package.
- Decide how a Fastify gateway declaration participates in an application definition.
- Decide which parts of the current web server API sketch remain non-working design examples.
- Update affected specs with approved behavior, leaving `UNIMPLEMENTED` markers where behavior is specified but not implemented.

## Out of Scope

- Implementing Fastify runtime behavior unless explicitly approved when this task becomes active.
- Discord, command-line, or other gateway behavior.
- A universal gateway abstraction beyond the minimal shared behavior already approved in existing specs.
- Component state, logging, lifecycle, or configuration behavior except where needed to describe Fastify gateway boundaries.
- Credentials, deployment settings, or environment-specific server configuration.

## Notes

- The current web server example imports non-existent `peranto` and `peranto-fastify` packages as an API design sketch.
- The core package must not take a Fastify runtime dependency.
- If a dedicated Fastify gateway spec becomes necessary, add it during this task and update `modifies` accordingly.
