+++
id = "t0031"
title = "Unified reply context for Discord handlers"
status = "pending"
tags = ["gateway", "discord"]
modifies = ["s0017"]
blocked_by = []
+++

## Problem

Discord handlers need to reply through different APIs depending on the source: interactions route via `replied`/`deferred` state, messages use `message.reply()`, and channels use `channel.send()`. Currently `reply.ts` only handles interaction error replies — it's single-purpose and not useful to handlers or the upcoming widget system (t0024).

Standalone utility functions per target type would be no more ergonomic than raw discord.js. The value is in a unified interface.

## Scope

### ReplyContext interface

A lightweight interface added to handler contexts alongside `call`:

```typescript
type ReplyContext = {
    reply(options: string | MessagePayload): Promise<Message | null>;
};
```

Returns `null` on failure (expired interactions, missing permissions) instead of throwing. Accepts strings as a convenience.

### Factory functions

Build a `ReplyContext` from different Discord objects:

- **Interaction** — fresh → `reply`, deferred → `editReply`, replied → `followUp`. Handles the `replied`/`deferred` routing that handlers currently do manually.
- **Message** — `message.reply()` (sends a reply referencing the original message).
- **Channel** — `channel.send()`.

### Handler context integration

Add `reply` to all handler contexts (`CommandHandlerContext`, `InteractionHandlerContext`, `EventHandlerContext`). The raw discord.js objects remain directly accessible — `reply` is an opt-in convenience, same pattern as `call`.

### Defer support

Interactions support deferral. Extend the interface for interaction-sourced contexts:

```typescript
type DeferrableReplyContext = ReplyContext & {
    deferReply(options?: { ephemeral?: boolean }): Promise<boolean>;
};
```

Returns `true` on success, `false` on failure.

### Error dispatch

Replace `replyUserError` with a dedicated `replyError` that always uses `followUp` when deferred (to guarantee ephemeral regardless of how the handler deferred). This stays internal to the gateway — not on the handler context.

### Replace `reply.ts`

Current `middleware/reply.ts` (`RepliableInteraction`, `replyUserError`) is replaced by the new module. The `RepliableInteraction` type may still be useful internally.

## Out of Scope

- Wrapper classes around discord.js objects (per s0015).
- Widget primitives (t0024) — but this provides the reply foundation they build on.
- Autocomplete reply (only supports `respond()` with choices, not general messages).

## Dependencies

- None (builds on existing gateway and handler context types).
