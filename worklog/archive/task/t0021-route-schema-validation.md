+++
id = "t0021"
title = "Add ArkType schema validation for route params and body"
status = "done"
tags = ["gateway", "fastify"]
modifies = ["s0016"]
blocked_by = []
+++

## Problem

Route handlers in `examples/fastify-web-server/src/gateway.ts` use unsafe `as` casts to type `request.params` and `request.body` (lines 73, 114, 120, 134, 140). No runtime validation occurs — malformed input reaches handler code unchecked.

## Approach

Added optional `params`, `body`, and `querystring` fields to `GatewayRoute` that accept ArkType-compatible schemas (`ComponentCallSchema`). The gateway handler wrapper validates incoming data against the schema before calling `handle`. Validated data is exposed as separate fields on `GatewayHandlerContext`, not on the Fastify request object.

A `route()` helper function infers handler context types from declared schemas, eliminating `as` casts. Routes without schemas can still be defined inline.

```typescript
route({
    method: "GET",
    path: "/threads/:thread_id",
    params: schema({"thread_id": "string"}),
    async handle({params, call, html}) {
        params.thread_id; // validated + typed from schema
    },
})
```

## Scope

- Added optional `params`, `body`, `querystring` schema fields to `GatewayRoute`.
- Added `params`, `body`, `querystring` validated fields to `GatewayHandlerContext`.
- Added `route()` export for per-route schema type inference.
- Validation in the gateway handler wrapper before calling `handle`.
- Updated `examples/fastify-web-server/src/gateway.ts` to use schemas instead of `as` casts.
- Updated spec s0016 with new types and behavior.
