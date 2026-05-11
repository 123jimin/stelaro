+++
id = "t0025"
title = "Discord handler middleware and error handling"
status = "pending"
tags = ["gateway", "discord"]
modifies = ["s0017"]
blocked_by = ["t0010"]
+++

## Problem

Discord bot handlers accumulate repetitive cross-cutting concerns: permission checks, rate limiting, partial fetching, concurrency control, and error classification. Without framework support, every handler manually implements these patterns, leading to boilerplate and inconsistent error behavior.

## Scope

### Guards

Composable pre-handler checks (role, permissions, channel type). A failing guard produces an ephemeral error reply and short-circuits the handler. Guards attach per-command, per-mount, or per-gateway.

### Rate limiting

Two flavors, attachable per-command or per-mount:
- **Sliding window:** N invocations per time window per key (user, channel, guild).
- **One-at-a-time:** Blocks concurrent invocations per key until the current one completes.

### Auto-fetch partials

An option on `event()` to transparently resolve partial reactions/messages/users before the handler runs. Eliminates the 5–10 line partial-check-and-fetch boilerplate in every reaction handler.

### Concurrency control

Limit concurrent handler invocations per key (channel, user, guild). Queued invocations wait rather than being rejected.

### Error handling

- **User-facing error class:** Distinguish errors that should be shown to the user (ephemeral reply) vs. logged internally. The gateway catches these and auto-replies.
- **Per-handler isolation:** One handler throwing in an event fan-out does not crash sibling handlers for the same event.

## Out of Scope

- Moderation systems, ban/kick commands, or audit logging.
- Authentication/authorization beyond simple guard predicates.
- Widget-level concerns (pagination, dialogs) — see t0024.

## Dependencies

- Depends on `t0010` for the core gateway (middleware hooks into the handler dispatch pipeline).
