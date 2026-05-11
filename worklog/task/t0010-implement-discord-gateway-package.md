+++
id = "t0010"
title = "Implement Discord gateway package"
status = "pending"
tags = ["gateway", "discord", "application", "examples"]
modifies = ["s0001", "s0004", "s0017"]
blocked_by = []
+++

## Problem

`peranto-discord` is an empty skeleton. The example from t0022 defines the intended API surface through concrete use; this task implements the package so the example compiles and runs.

## Scope

### Command routing

- `defineDiscordGateway()` composes mounts from `defineDiscordRoutes()` (per t0023 mount model). Each mount declares its own `uses` and command/event/interaction definitions.
- The gateway registers all contributed commands with the Discord API on start.
- Command definitions accept ArkType schemas for option validation (parallel to Fastify route `params`/`body`/`querystring`). Validated options are passed to the handler as a typed object.
- Autocomplete handlers are co-located with their command definition. The gateway extracts the focused option and passes it to the handler.

### Event routing

- Gateway accepts declarative event handler definitions for client events (`messageCreate`, `messageReactionAdd`, etc.).
- Event handlers receive a context with `call()` and the raw discord.js event arguments.

### Interaction routing (persistent)

- Gateway accepts declarative interaction handler definitions matched by custom ID pattern.
- Handles buttons, select menus, and modal submissions that outlive the original command invocation.
- Transient interactions (created and awaited within one handler via discord.js collectors) remain the handler's responsibility.

### Handler context

- All handler types receive a context with typed `call()` narrowed to declared `uses`, plus raw discord.js objects (`interaction`, `client`, `message` depending on handler type).
- No wrapper types around discord.js objects (per s0015).

### Lifecycle

- Start: log in client, register commands with Discord API, attach event listeners.
- Stop: remove listeners, destroy client.
- Config schema: `{ token: string, application_id: string, guild_id?: string }`.

### Validation

- Make the t0022 example compile and run against the implemented package.
- Update s0017 if implementation diverges from what the example assumed.

## Out of Scope

- Fastify or other non-Discord gateway behavior.
- Embed/component builders, reply wrappers, or other discord.js convenience layers (per s0015).
- Permission/role system, rate limiting, or moderation.
- Prompt, memory, or model-provider behavior.
- Sharding or clustering.

## Dependencies

- Depends on `t0023` for the mount model (established on Fastify side).
- Depends on `t0022` for the API surface design (example as brainstorm board).
- Depends on `t0018` for a stable application runtime.
