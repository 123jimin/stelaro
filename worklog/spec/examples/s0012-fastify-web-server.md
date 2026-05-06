+++
id = "s0012"
title = "Fastify Web Server Example"
tags = ["examples"]
paths = ["examples/fastify-web-server/**"]
+++

## Related Specs

- s0010: Examples (Common)

## Behavior

- A BBS (bulletin board system) server built from public Peranto APIs. `UNIMPLEMENTED`
- Users may create threads and leave comments. `UNIMPLEMENTED`
- Persistence uses JSON or JSONL files instead of a database. `UNIMPLEMENTED`
- Authentication uses `@fastify/passport` with Google and Discord strategies. `UNIMPLEMENTED`
- Authentication credentials are mock values. `UNIMPLEMENTED`

## Constraints

- The example must build only from public Peranto APIs.
- Authentication credentials must be mock values, never real secrets.

## Anticipated Changes

- None recorded.

## Dangers

- Replacing mock credentials with real ones would make the example unsafe to reuse.
- Adding behavior beyond approved BBS scope (threads, comments, mock-authenticated sessions) would make the example imply unsupported behavior.
