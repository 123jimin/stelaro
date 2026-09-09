+++
id = "s0015"
title = "Gateways (Common)"
tags = ["gateway"]
paths = []
+++

## Behavior

- A gateway is a Stelaro component that bridges an external interface to typed
  component calls.
- Handlers receive the underlying platform instance or client and use its
  native API directly.
- Route, command, and event definitions are co-located with the component code
  they primarily serve. A definition spanning components belongs to its
  primary resource's group.
- Components export gateway-specific mount groups containing handlers and
  their `uses`. A gateway composes them with its own handlers and `uses`;
  effective dependencies are deduplicated by reference.
- Gateway-owned handlers and dependencies are reserved for concerns that do
  not belong to a component.
- UNIMPLEMENTED Gateways may expose typed outbound protocol capabilities;
  non-gateway components may consume them through typed component calls.

## Constraints

- Gateways SHOULD use platform-native types and SHOULD NOT wrap or redefine
  equivalent platform objects.
- Shared gateway implementation belongs in common code. Repeated consumer
  patterns belong in helpers only after they recur.
- Dispatch, lifecycle, and registration take precedence over convenience
  helpers.
- Gateway APIs are designed from concrete examples rather than speculative
  abstractions.

## Anticipated Changes

- Additional gateways and evidence-backed convenience helpers may be added.
