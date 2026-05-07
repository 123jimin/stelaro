+++
id = "s0016"
title = "Fastify Gateway"
tags = ["gateway", "fastify"]
paths = ["packages/peranto-fastify/**"]
+++

## Related Specs

- s0015: Gateways (Common)
- s0012: Fastify Web Server Example

## Behavior

### Gateway definition

- A Fastify gateway is a Peranto component that bridges HTTP requests to component calls. `UNIMPLEMENTED`
- A gateway declares which component call surfaces it uses. The component dispatch function is typed exclusively from these declarations. `UNIMPLEMENTED`
- A gateway receives a Fastify instance and registers its routes on it. The gateway does not create its own instance. `UNIMPLEMENTED`
- Server listen port is read from component config. `UNIMPLEMENTED`

### Route definitions

- Each route specifies an HTTP method and path. `UNIMPLEMENTED`
- Route definitions accept all standard Fastify route options and forward them without interpretation. These properties use Fastify's own types directly. `UNIMPLEMENTED`
- Each route has a handler that receives the Fastify request and reply objects alongside Peranto-provided helpers. `UNIMPLEMENTED`

### Response helpers

- The redirect helper sends an HTTP redirect response. `UNIMPLEMENTED`

### Lifecycle

- The gateway registers routes during its component start hook and begins listening. `UNIMPLEMENTED`
- The gateway closes the server during its component stop hook. `UNIMPLEMENTED`

## Constraints

- The gateway must not define types that parallel Fastify's own types for requests, replies, route options, or hooks.
- The gateway must not interpret, validate, or transform any standard Fastify route option — only forward it.
- The component dispatch function must reject calls not declared in the gateway's dependency list at the type level.

## Anticipated Changes

- An HTML response helper may be added if a common pattern emerges across examples.

## Dangers

- Introducing gateway-level middleware hooks would blur the boundary between Fastify-level and gateway-level concerns.
- Wrapping Fastify's request or reply in gateway-specific types would create a parallel type system that diverges over time.
