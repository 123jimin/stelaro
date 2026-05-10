+++
id = "s0015"
title = "Gateways (Common)"
tags = ["gateway"]
paths = []
+++

## Related Specs

- s0016: Fastify Gateway
- s0017: Discord Gateway

## Behavior

- A gateway is a Peranto component that bridges an external interface to component calls.
- A gateway exposes the raw underlying instance or client to route/event handlers. Handlers interact with the native API directly rather than through gateway abstractions.
- Gateway API surfaces are designed through example projects first, then extracted into implementations.

### Mount model

- Route, command, and event handler definitions are co-located with the component code they serve, not centralized in the gateway file.
- Components export **route groups** (gateway-specific binding sets) that declare their own `uses` and handler definitions.
- The gateway composes route groups (mounts) into a single gateway component. The gateway's `uses` is the merge of its own `uses` and all mounts' `uses`, deduplicated by reference.
- The gateway may declare its own `uses` and handlers for gateway-level concerns that do not belong to any component.
- Route groups are grouped by primary domain: a route that calls multiple components belongs to the route group of the primary resource it serves.

## Constraints

- Gateways must not redefine types or abstractions that the underlying platform already provides. Use the platform's own types directly.
- Shared behavior across gateway implementations must be factored into common code rather than reimplemented per gateway.
- Shared patterns in gateway usage (across example projects or applications) must be factored into helpers rather than duplicated by consumers.
- Core gateway features (component dispatch, lifecycle, route/event registration) take priority over convenience helpers.

## Anticipated Changes

- Additional gateway implementations may be added beyond Fastify and Discord.
- Convenience helpers may be introduced when recurring patterns emerge across examples and applications.

## Dangers

- Wrapping platform-native objects in gateway-specific types creates a parallel type system that diverges over time and blocks access to platform features.
- Adding convenience helpers before core features stabilize risks locking in APIs that conflict with later design decisions.
- Designing gateway APIs without a driving example leads to speculative abstractions that don't serve real use cases.
