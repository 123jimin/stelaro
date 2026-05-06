+++
id = "t0005"
title = "Implement Fastify gateway package"
status = "pending"
tags = ["gateway", "fastify", "application", "examples"]
modifies = ["s0001", "s0004", "s0011"]
blocked_by = ["t0018"]
+++

## Scope

- Define the approved Fastify gateway behavior needed by the web server example.
- Specify how external HTTP requests bind to typed Peranto component calls.
- Specify what gateway-specific request and response concepts belong in the Fastify package instead of the core package.
- Decide how a Fastify gateway declaration participates in an application definition.
- Implement the Fastify gateway package behavior.
- Bind HTTP routes to typed Peranto component calls.
- Validate request bodies with schemas where route definitions provide them.
- Provide approved response helpers for HTTP route behavior.
- Expose approved outbound HTTP-facing capabilities through typed gateway call APIs.
- Update the web server example to use public Peranto and Fastify gateway APIs naturally.
- Update affected specs with approved behavior.

## Out of Scope

- Discord, command-line, or other non-HTTP gateway behavior.
- A universal gateway abstraction beyond the minimal shared behavior already approved in existing specs.
- Production deployment configuration.
- Authentication, authorization, sessions, or database integrations unless separately specified.
- Credentials, deployment settings, or environment-specific server configuration.

## Notes

- The current web server example imports non-existent `peranto` and `peranto-fastify` packages as an API design sketch.
- The core package must not take a Fastify runtime dependency.
- If a dedicated Fastify gateway spec becomes necessary, add it during this task and update `modifies` accordingly.

## Dependencies

- Depends on `t0018` for a stable application runtime.
