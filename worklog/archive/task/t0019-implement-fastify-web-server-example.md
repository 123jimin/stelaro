+++
id = "t0019"
title = "Implement Fastify web server example"
status = "done"
tags = ["examples", "fastify"]
modifies = ["s0012", "s0016"]
blocked_by = []
+++

## Scope

- Implement the BBS example under `examples/fastify-web-server/` as an API design sketch.
- Explore the Fastify gateway API surface: route definitions and request/response helpers.
- Define components for users, threads, and comments with direct JSONL file I/O per request.
- Sketch authentication via `@fastify/passport` (Google, Discord) and ID-based login as Fastify-level middleware, separate from the gateway definition.
- Add `examples/*` to `pnpm-workspace.yaml` so the example is a workspace member.
- The example should be executable and testable once peranto packages are implemented.

## Out of Scope

- Implementing real `peranto-fastify` package behavior (that is t0005).
- Real OAuth credentials or working OAuth flows.
- Production deployment concerns.
- Persistent component state — components read/write JSONL directly, no in-memory caching.

## File Structure

```
examples/fastify-web-server/
  package.json
  tsconfig.json
  src/
    index.ts        — defineApplication, createApplication, startup
    users.ts        — UsersCalls, UsersComponent
    threads.ts      — ThreadsCalls, ThreadsComponent
    comments.ts     — CommentsCalls, CommentsComponent
    gateway.ts      — defineFastifyGateway, all routes
    auth.ts         — passport strategies, session setup, requireAuth hook
    storage.ts      — readJsonl / appendJsonl helpers
```

## package.json

```json
{
  "name": "@jiminp/example-fastify-web-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "clean": "rimraf dist tsconfig.tsbuildinfo",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@jiminp/peranto": "workspace:*",
    "@jiminp/peranto-fastify": "workspace:*",
    "arktype": "^2.2.0",
    "fastify": "^5.3.3",
    "@fastify/passport": "^3.1.1",
    "@fastify/secure-session": "^8.1.0"
  }
}
```

## pnpm-workspace.yaml

Add `examples/*` alongside the existing `packages/*` entry.

## Notes

- The explored API surface here directly informs t0005's implementation scope.
- The gateway definition must stay auth-agnostic. Auth and sessions are configured at the Fastify application level; route handlers access auth state through the Fastify request object.
- s0012 specifies append-only JSONL storage, in-memory sessions, and three auth methods (Google OAuth, Discord OAuth, ID-based).
