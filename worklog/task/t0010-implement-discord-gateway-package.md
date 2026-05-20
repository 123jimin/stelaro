+++
id = "t0010"
title = "Implement Discord gateway package"
status = "active"
tags = ["gateway", "discord", "application", "examples"]
modifies = ["s0001", "s0004", "s0017"]
blocked_by = []
+++

## Problem

`stelaro-discord` is an empty skeleton. The example from t0022 defines the intended API surface through concrete use; this task implements the package so the example compiles and runs.

## Scope

### Package setup

- Add `discord.js` as a peerDependency to `packages/stelaro-discord/package.json`.

### Command routing

- `defineDiscordGateway()` composes mounts from `defineDiscordMounts()` (per t0023 mount model). Each mount declares its own `uses` and command/event/interaction definitions.
- The gateway registers all contributed commands with the Discord API on start.
- Command definitions accept ArkType schemas for option validation (parallel to Fastify route `params`/`body`/`querystring`). Validated options are passed to the handler as a typed object.
- `command()` infers `ChatInputCommandInteraction` or `MessageContextMenuCommandInteraction` from the builder type (`SlashCommandBuilder` vs `ContextMenuCommandBuilder`), eliminating union casts in handlers.
- Autocomplete is defined as a per-option map on the command definition, keyed by option name. The framework extracts the focused option and dispatches to the matching handler automatically.
- Each autocomplete handler receives `{value, call, interaction}` and returns `string[]` (auto-wrapped to `{name, value}[]`) or `{name, value}[]` directly. The framework auto-truncates names to 100 chars and caps at 25 choices.
- For subcommand option name collisions, qualified keys (`"subcommand/option"`) disambiguate; unqualified keys match by option name only.
- A single-function fallback (`autocomplete: async ({interaction, call}) => ...`) is supported for non-standard cases.

### Event routing

- Gateway accepts declarative event handler definitions for client events (`messageCreate`, `messageReactionAdd`, etc.).
- Event handlers receive a context with `call()` and the raw discord.js event arguments.
- `event()` maps discord.js `Events.*` constants to their callback signatures, narrowing the `event` tuple type instead of `unknown[]`.

### Interaction routing (persistent)

- Gateway accepts declarative interaction handler definitions matched by custom ID pattern with named segments (e.g. `"quote:delete:{quote_id}"`). Named segments produce a typed object inferred from the pattern string literal via template literal types. Supersedes the `*` glob syntax from the original s0017 spec.
- Handles buttons, select menus, and modal submissions that outlive the original command invocation.
- Transient interactions (created and awaited within one handler via discord.js collectors) remain the handler's responsibility.

### Handler context

- All handler types receive a context with typed `call()` narrowed to declared `uses`, plus raw discord.js objects (`interaction`, `client`, `message` depending on handler type).
- The user creates the `Client` externally (for intent configuration); the gateway owns login and destroy via config token. No wrapper types around discord.js objects (per s0015).

### Lifecycle

- Start: log in client, register commands with Discord API, attach event listeners.
- Stop: remove listeners, destroy client.
- Config schema: `{ token: string, application_id: string, guild_id?: string }`.

### Spec updates

s0017 type changes:
- `EventHandlerContext.event`: `unknown[]` → typed tuple narrowed by `Events.*` type parameter.
- `CommandHandlerContext.interaction`: `ChatInputCommandInteraction | MessageContextMenuCommandInteraction` → split into two distinct context types inferred from builder type.
- `InteractionHandlerContext.params`: `string[]` → typed object inferred from named pattern segments. Pattern syntax changes from `*` glob to `{name}` segments.
- `CommandDefinition.autocomplete`: single function → per-option map (with single-function fallback).
- `CommandDefinition`: add optional ArkType option schema field.

s0001, s0004: update to reflect the Discord gateway as a second gateway implementation alongside Fastify.

### Validation

- Make the t0022 example compile and run against the implemented package.
- Update the example to use type improvements (typed events, split command context, named params, autocomplete map) where applicable.

## Out of Scope

- Fastify or other non-Discord gateway behavior.
- Embed/component builders, reply wrappers, or other discord.js convenience layers (per s0015).
- Widget system (pagination, confirm dialogs, streaming messages) — see t0024.
- Handler middleware, guards, rate limiting — see t0025.
- Prompt, memory, or model-provider behavior.
- Sharding or clustering.

## Dependencies

- Depends on `t0023` for the mount model (established on Fastify side).
- Depends on `t0022` for the API surface design (example as brainstorm board).
- Depends on `t0018` for a stable application runtime.
