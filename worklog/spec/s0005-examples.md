+++
id = "s0005"
title = "Examples"
tags = ["examples"]
paths = ["examples/**"]
+++

## Behavior

- The repository contains example projects under `examples/`.
- Examples that are implemented demonstrate typed component calls, component state, gateway integration, logging, and validated configuration through natural use.

### Web Server (API design sketch)

- A non-working API design sketch using non-existent `peranto` and `peranto-fastify` packages.

### Fastify Web Server (BBS)

- A BBS (bulletin board system) server built from public Peranto APIs. `UNIMPLEMENTED`
- Users may create threads and leave comments. `UNIMPLEMENTED`
- Persistence uses JSON or JSONL files instead of a database. `UNIMPLEMENTED`
- Authentication uses `@fastify/passport` with Google and Discord strategies. `UNIMPLEMENTED`
- Authentication credentials are mock values. `UNIMPLEMENTED`

### Discord Chatbot

- An empty shell. `UNIMPLEMENTED`

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
