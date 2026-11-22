+++
id = "t0028"
title = "Improve Fastify route config typing and gateway lifecycle clarity"
tags = ["fastify", "gateway", "examples"]
modifies = ["s0017", "s0021"]
status = "pending"
+++

# Improve Fastify route config typing and gateway lifecycle clarity

Remove repetitive manual `GatewayHandlerContext<...>` annotations in Fastify route definitions and resolve the single-use `FastifyInstance` restart hazard in `defineFastifyGateway`.

## Scope and design

- Improve `defineFastifyRoutes` and `defineFastifyRoute` config typing without phantom marker fields:
  - Support either an explicit config type parameter (e.g., `defineFastifyRoutes<WebConfig>()(...)` or equivalent) or an optional `config` schema on the route group so `TConfig` flows contextually into all routes and preserves `params`/`body`/`querystring` inference without manual `GatewayHandlerContext<TUses, TConfig>` annotations or repeating `TUses`.
  - Evaluate whether a route-builder form inside `defineFastifyRoutes` further removes boilerplate while keeping schema-free inline routes ergonomic.
- Address the `defineFastifyGateway` restartability defect:
  - Currently `start()` mounts routes onto a caller-supplied `FastifyInstance` and calls `listen()`, while `stop()` calls `server.close()`.
    A second `start()` after `stop()` fails because Fastify forbids re-mounting/re-listening on a closed instance.
  - Decide and specify in `s0017` whether `defineFastifyGateway` accepts a server factory (supporting restart cycles cleanly, and optionally enabling a `setup` hook to avoid the deferred `dispatchUserCall` cell in `examples/fastify-web-server/src/app.ts`) or explicitly documents single-use `FastifyInstance` semantics and guards/fails clearly on restart.
- Update `examples/fastify-web-server` (`src/threads/index.ts`, `src/auth.ts`, `src/comments.ts`, `src/gateway.ts`, and `src/app.ts` if gateway setup changes) to use the cleaner route config typing.

## Completion criteria

- Update `s0017` and `s0021` with the revised route-group config typing API and gateway lifecycle/restart contract.
- Implement the typing and lifecycle changes in `packages/stelaro-fastify`.
- Simplify `examples/fastify-web-server` routes to drop manual `ThreadRouteUses` / `GatewayHandlerContext<..., WebConfig>` repetition and explicit 3-arg `defineFastifyRoute<...>` calls.
- Add runtime and type tests verifying inferred `getConfig()`, inferred `params`/`body`/`querystring`, rejection of mismatched gateway `config` schemas, and the specified restart behavior.
- Pass `pnpm build`, `pnpm lint`, and `pnpm test`.
