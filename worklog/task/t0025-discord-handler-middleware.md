+++
id = "t0025"
title = "Discord handler middleware and error handling"
status = "pending"
tags = ["gateway", "discord"]
modifies = ["s0017"]
blocked_by = ["t0010", "t0030"]
+++

## Problem

Discord bot handlers accumulate repetitive cross-cutting concerns: permission checks, rate limiting, partial fetching, concurrency control, and error classification. Without framework support, every handler manually implements these patterns, leading to boilerplate and inconsistent error behavior.

## Scope

### Guards

Composable pre-handler checks (role, permissions, channel type). A failing guard produces an ephemeral error reply and short-circuits the handler. Guards attach per-command, per-mount, or per-gateway.

### Rate limiting & concurrency integration

Discord-specific key extractors (`perUser`, `perChannel`, `perGuild`) that plug into the core rate limiter and concurrency limiter from t0030. Sliding-window rejects with an ephemeral "slow down" reply. Concurrency queues until a slot opens. Attachable per-command, per-event, or per-mount.

### Auto-fetch partials

An option on `event()` to transparently resolve partial reactions/messages/users before the handler runs. Eliminates the 5–10 line partial-check-and-fetch boilerplate in every reaction handler.

### Error dispatch

- **UserFacingError catch:** When a handler throws `UserFacingError` (from t0030), the gateway auto-replies with an ephemeral message containing `user_message` instead of just logging.
- **Per-handler isolation:** One handler throwing in an event fan-out does not crash sibling handlers for the same event.

## Out of Scope

- Moderation systems, ban/kick commands, or audit logging.
- Authentication/authorization beyond simple guard predicates.
- Widget-level concerns (pagination, dialogs) — see t0024.

## Dependencies

- `t0010`: Core gateway (middleware hooks into the handler dispatch pipeline).
- `t0030`: Core middleware primitives (rate limiter, concurrency limiter, `UserFacingError`).
