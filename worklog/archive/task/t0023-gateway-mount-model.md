+++
id = "t0023"
title = "Refactor gateways to mount model"
status = "done"
tags = ["gateway", "fastify", "architecture"]
modifies = ["s0015", "s0016", "s0012"]
blocked_by = []
+++

## Problem

Gateway route/command definitions currently live in a central gateway file. Every feature addition, removal, or modification to any component requires editing the gateway file. The gateway becomes a monolithic router that knows the details of every component's presentation layer.

The desired property: **minimize edits outside of component code** when adding, removing, or modifying features. Route/command definitions should be co-located with the component they serve.

## Approach

Introduce a **mount model** for gateways. Components export gateway-specific binding groups (routes, commands, events). The gateway composes these mounts into a single gateway component.

### For peranto-fastify

- Add `defineFastifyRoutes()` — defines a group of routes with their own `uses` declaration and route list.
- Update `defineFastifyGateway()` to accept a `mounts` array of route groups. The gateway merges all mounts' routes with its own `uses`.
- The gateway may also accept its own `routes` for gateway-level concerns (health checks, etc.) that don't belong to any component.

### Example migration

Before (central gateway owns everything):
```typescript
defineFastifyGateway({
    id: "http",
    server,
    uses: [UsersCalls, ThreadsCalls, CommentsCalls],
    routes: [/* 15 route definitions */],
});
```

After (components own their routes):
```typescript
// threads.ts
export const ThreadsRoutes = defineFastifyRoutes({
    uses: [ThreadsCalls, CommentsCalls, UsersCalls],
    routes: [
        route({ method: "GET", path: "/threads/:thread_id", ... }),
        route({ method: "POST", path: "/threads", ... }),
    ],
});

// gateway.ts — own uses for gateway-level routes, merged with mounts
defineFastifyGateway({
    id: "http",
    server,
    uses: [],
    mounts: [ThreadsRoutes, CommentsRoutes, AuthRoutes, IndexRoutes],
    routes: [/* gateway-level routes like health checks */],
});
```

### Edit impact

| Operation | Before | After |
|---|---|---|
| Add component | Edit gateway + import | Add one entry to `mounts` |
| Add feature | Edit gateway | Edit component file only |
| Modify feature | Edit gateway | Edit component file only |
| Remove component | Edit gateway | Remove one entry from `mounts` |

## Scope

- Update s0015 (Gateways Common) with the mount philosophy: gateways compose route/command mounts exported by component code, rather than owning all bindings centrally.
- Update s0016 (Fastify Gateway) types and behavior to include `defineFastifyRoutes()` and `mounts`.
- Implement `defineFastifyRoutes()` and update `defineFastifyGateway()` in `packages/peranto-fastify/src/index.ts`.
- Refactor `examples/fastify-web-server/` to use mounts. Routes move from `gateway.ts` into their respective component files.
- Update s0012 (Fastify Web Server Example) to reflect the new structure.
- Verify the example builds clean after refactor.

## Out of Scope

- Discord gateway implementation (t0010).
- Changing component call or handler definitions — only the gateway binding layer changes.
- Auto-discovery or convention-based mount registration — mounts are explicit.

## Design Decisions

### Q1: How should mounts compose `uses`?

**Merged.** The gateway has its own `uses` for gateway-level routes, merged with mounts' `uses`. Pure inference (no top-level `uses`) prevents the gateway from having its own routes. Explicit validation of mounts against a top-level declaration adds bureaucratic overhead with no real safety benefit.

### Q2: How should cross-component routes be grouped?

**Primary domain.** Group by the primary resource the route serves. The thread view belongs to `ThreadsRoutes` even though it calls `CommentsCalls`. The API is flexible enough to support page-level grouping (a mount's `uses` can reference any component calls), but the example should demonstrate domain-based grouping as the default convention.

## Dependencies

- None. This is a refactor of existing working code.
