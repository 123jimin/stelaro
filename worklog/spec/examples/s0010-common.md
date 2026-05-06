+++
id = "s0010"
title = "Examples (Common)"
tags = ["examples"]
paths = ["examples/**"]
+++

## Related Specs

- s0011: Web Server Example
- s0012: Fastify Web Server Example
- s0013: Mini Stock Market Example
- s0014: Discord Chatbot Example

## Behavior

- The repository contains example projects under `examples/`.
- Examples that are implemented demonstrate typed component calls, component state, gateway integration, logging, and validated configuration through natural use.

## Constraints

- Examples must not contain credentials, tokens, or environment-specific assumptions.
- Non-working API design sketches must not be presented as runnable examples.
- Examples must not imply unsupported behavior.

## Anticipated Changes

- Additional example projects may be added under `examples/`, governed by their own per-example specs.

## Dangers

- Adding concrete runtime behavior without explicit specification would make the examples imply unsupported behavior.
- Adding credentials or environment-specific assumptions would make the examples unsafe to reuse.
