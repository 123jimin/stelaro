+++
id = "t0019"
title = "Implement Fastify web server example"
status = "pending"
tags = ["examples", "fastify"]
modifies = ["s0012"]
blocked_by = []
+++

## Scope

- Implement the BBS example under `examples/fastify-web-server/` as an API design sketch.
- Explore the Fastify gateway API surface: route definitions, request/response helpers, session integration, authentication hooks.
- Define components for users, threads, and comments with JSONL persistence.
- Sketch authentication via `@fastify/passport` (Google, Discord) and ID-based login.
- All `peranto` and `peranto-fastify` imports are non-existent API sketches — the example is not expected to run.

## Out of Scope

- Implementing real `peranto-fastify` package behavior (that is t0005).
- Real OAuth credentials or working OAuth flows.
- Production deployment concerns.

## Notes

- Follows the same pattern as `examples/web-server/` — a non-working sketch that explores API design.
- The explored API surface here directly informs t0005's implementation scope.
- s0012 specifies append-only JSONL storage, in-memory sessions, and three auth methods (Google OAuth, Discord OAuth, ID-based).
