+++
id = "t0025"
title = "Discord handler middleware and error handling"
status = "done"
tags = ["gateway", "discord"]
modifies = ["s0017"]
blocked_by = ["t0010", "t0030"]
+++

## Problem

Discord bot handlers accumulate repetitive cross-cutting concerns: permission checks, rate limiting, partial fetching, concurrency control, and error classification. Without framework support, every handler manually implements these patterns, leading to boilerplate and inconsistent error behavior.

## Scope

All changes live in `packages/stelaro-discord`.

### 1. Error dispatch

Modify the gateway's top-level `try/catch` in `dispatchCommand`, `dispatchInteraction`, and the event loop:

- When a handler throws `UserFacingError`, reply ephemerally with `error.user_message`. Check `interaction.replied || interaction.deferred` (discord.js booleans) to choose the reply method: `followUp({ephemeral: true})` if either is `true`, otherwise `reply({ephemeral: true})`. Always use `followUp` (not `editReply`) for the deferred case — `editReply` would inherit the defer's ephemerality, which may be `false`.
- Other errors are logged as today.
- Event handlers that share the same event type run independently: one rejection does not prevent sibling handlers from executing. Errors are collected and logged after all complete.

No new types. Changes are in `gateway.ts` dispatch functions only.

### 2. Guards

A guard is a pre-handler check that rejects an interaction by throwing `UserFacingError`.

```typescript
// src/middleware/guard.ts

type GuardContext = {
    readonly interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction
        | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
    readonly client: Client;
};

type Guard = (context: GuardContext) => Promisable<void>;
```

A guard returns to pass or throws `UserFacingError` to reject. The thrown error is caught by the existing error dispatch pipeline (section 1), which replies ephemerally and skips the handler. Users can subclass `UserFacingError` for richer error categorization.

Guards attach at three levels, executed outer-to-inner (first throw aborts):

1. `DiscordGatewayDefinition.guards` — all commands and interactions in this gateway.
2. `DiscordMountGroup.guards` — all handlers in this mount.
3. `CommandDefinition.guards` / `InteractionDefinition.guards` — per-handler.

Guards do **not** apply to events (no interaction to reply to) or autocomplete (no ephemeral reply channel).

Each level is an optional `readonly guards?: readonly Guard[]` field.

### 3. Rate limiting

Discord-specific key extractors and per-handler rate limit declarations.

```typescript
// src/middleware/key.ts

type KeyExtractor = (interaction: Interaction) => string;

function perUser(interaction: Interaction): string;    // interaction.user.id
function perGuild(interaction: Interaction): string;   // interaction.guildId ?? "dm"
function perChannel(interaction: Interaction): string; // interaction.channelId ?? "unknown"
```

```typescript
// src/middleware/rate-limit.ts

type RateLimitOptions = {
    readonly limit: number;
    readonly window_ms: number;
    readonly key?: KeyExtractor;  // default: perUser
};
```

Attaches via optional `CommandDefinition.rate_limit` and `InteractionDefinition.rate_limit` fields. When `RateLimiter.check()` returns `false`, the gateway replies ephemerally with a "slow down" message and skips the handler.

The gateway creates one `RateLimiter` instance per definition that declares `rate_limit`. Limiters are created during `start` and live for the gateway's lifetime.

### 4. Concurrency limiting

```typescript
// src/middleware/concurrency.ts

type ConcurrencyOptions = {
    readonly max: number;
    readonly key?: KeyExtractor;  // default: perUser
};
```

Attaches via optional `CommandDefinition.concurrency` and `InteractionDefinition.concurrency` fields. The gateway calls `acquire()` before the handler and releases in a `finally` block.

One `ConcurrencyLimiter` instance per definition that declares `concurrency`.

### 5. Auto-fetch partials

An optional `fetch_partials` boolean on `EventDefinition`:

```typescript
type EventDefinition = {
    ...existing fields,
    readonly fetch_partials?: boolean;
};
```

When `true`, the gateway iterates event arguments before the handler runs. Any argument with `partial === true` and a `fetch()` method is resolved via `await arg.fetch()`. The fetched result replaces the partial in the arguments tuple passed to the handler.

### Execution order

For commands and interactions, the pipeline per dispatch is:

1. Guards (gateway → mount → handler level; first rejection aborts)
2. Rate limit check (ephemeral reject if exceeded)
3. Concurrency acquire (waits for a slot)
4. Option validation (commands only, existing behavior)
5. Handler execution
6. Concurrency release (`finally`)
7. Error dispatch (`UserFacingError` → ephemeral reply; other errors → log)

For events:

1. Auto-fetch partials (if `fetch_partials` is `true`)
2. Handler execution (isolated per handler for same event type)
3. Error logging (per handler)

For autocomplete: no middleware (guards, rate limit, concurrency do not apply). Existing dispatch is unchanged.

### Barrel exports

Export from `packages/stelaro-discord/src/index.ts`:
- Types: `Guard`, `GuardContext`, `KeyExtractor`, `RateLimitOptions`, `ConcurrencyOptions`
- Functions: `perUser`, `perGuild`, `perChannel`

## Out of Scope

- Moderation systems, ban/kick commands, or audit logging.
- Authentication/authorization beyond simple guard predicates.
- Widget-level concerns (pagination, dialogs) — see t0024.
- Mount-level or gateway-level rate limiting / concurrency (only per-handler).
- Guard composition utilities (`allOf`, `anyOf`) — can be added later as plain functions.

## Dependencies

- `t0010`: Core gateway (middleware hooks into the handler dispatch pipeline). Done.
- `t0030`: Core middleware primitives (`createRateLimiter`, `createConcurrencyLimiter`, `UserFacingError`). Done.
