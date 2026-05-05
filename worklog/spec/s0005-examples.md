+++
id = "s0005"
title = "Examples"
tags = ["examples"]
paths = ["examples/**"]
+++

## Behavior

- The repository contains example projects under `examples/`.
- The Discord chatbot example is an empty shell. `UNIMPLEMENTED`
- The web server example is a non-working API design sketch using non-existent `peranto` and `peranto-fastify` packages.
- The Fastify web server example demonstrates a working Fastify-based application built from public Peranto APIs. `UNIMPLEMENTED`
- Examples that are implemented demonstrate typed component calls, component state, gateway integration, logging, and validated configuration through natural use.

## Constraints

- Examples must not contain credentials, tokens, or environment-specific assumptions.
- Non-working API design sketches must not be presented as runnable examples.
- Examples must not imply unsupported behavior.

## Anticipated Changes

- The Discord chatbot example may receive specified behavior.
- The web server API design sketch may be retired once the Fastify web server example is implemented.

## Dangers

- Adding concrete runtime behavior without explicit specification would make the examples imply unsupported behavior.
- Adding credentials or environment-specific assumptions would make the examples unsafe to reuse.
