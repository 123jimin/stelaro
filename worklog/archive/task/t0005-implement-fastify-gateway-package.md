+++
id = "t0005"
title = "Implement Fastify gateway package"
status = "done"
tags = ["gateway", "fastify", "examples"]
modifies = ["s0012", "s0016"]
blocked_by = []
+++

## Scope

### Implementation

- Implement `defineFastifyGateway` per s0016 types and behavior.
- Define a component config schema for the server listen port.
- Add `fastify` as a peer dependency to `peranto-fastify`.
- Register routes on the Fastify instance during the component start hook and begin listening.
- Close the Fastify server during the component stop hook.
- Implement `GatewayHandlerContext`: typed `call` dispatch narrowed to `uses` declarations, `redirect` helper.
- Forward all standard Fastify route options via `Omit<RouteOptions, "method" | "url" | "handler">` without interpretation.

### Example update

- Update `examples/fastify-web-server` to use config-based port instead of hardcoded `port: 3000` in the gateway definition.

### Spec cleanup

- Remove `UNIMPLEMENTED` markers from s0016 as behavior is implemented.
- Retire s0011 (old design sketch, superseded by s0012).

## Out of Scope

- Discord, command-line, or other non-HTTP gateway behavior.
- Gateway-level request body validation beyond what Fastify provides natively through forwarded route options.
- Authentication, authorization, sessions, or database integrations.
- Production deployment configuration, credentials, or environment-specific server configuration.

## Notes

- s0016 and the example (t0019) were designed together — the API surface is already validated by usage.
- The core package must not take a Fastify runtime dependency.
- Request body schema validation is handled by Fastify natively when consumers pass `schema` in route options — the gateway forwards it without interpretation.

## Dependencies

- `t0018`: Stable application runtime (done).
- `t0019`: Fastify web server example driving the API design (done).
