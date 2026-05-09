+++
id = "t0022"
title = "Implement Discord quote board example"
status = "pending"
tags = ["examples", "gateway", "discord"]
modifies = ["s0014", "s0017"]
blocked_by = []
+++

## Problem

s0014 (Discord Chatbot Example) is an empty shell, and s0017 (Discord Gateway) is a skeleton spec with no behavior defined. Before implementing the gateway package (t0010), we need a concrete example that exercises the API surface through natural use, so the gateway design is driven by real needs rather than speculation.

## Scope

- Implement a "Quote Board" Discord bot example under `examples/discord-chatbot/`.
- The example uses `peranto-discord` APIs that do not exist yet. Write the example against the intended API shape, using the example as the design brainstorm for the package. The code will not compile until t0010 is done.
- Update s0014 with the approved example behavior.
- Update s0017 with gateway behavior, types, and constraints discovered through designing the example.

### Features the example must exercise

#### Slash commands

- `/quote random [user]` — Fetch a random quote, optionally filtered by quoted user. Calls `QuotesCalls.random`.
- `/quote search <query>` — Search quotes. `query` option has autocomplete, calling `QuotesCalls.search` with partial input.
- `/quote list [user]` — List quotes with pagination. Returns an embed with Previous/Next buttons.

#### Context menu commands

- `Save as Quote` — Message context menu. Extracts the target message content and author, calls `QuotesCalls.create`.

#### Events

- `messageReactionAdd` — When a message receives N+ reactions of a configured emoji, auto-save as quote and post to a configured "board" channel. Demonstrates event handler dispatching to component calls.

#### Persistent interactions

- Delete button on quote embeds — Routed by custom ID pattern (`quote:delete:<quote_id>`). Only the user who saved the quote can delete it. Calls `QuotesCalls.delete`.
- Pagination buttons on list embeds — Routed by custom ID pattern (`quote:list:<user_filter>:<page>`). Stateless pagination encoded in the custom ID.

#### Backend components

- `users` — `resolve` call. Maps Discord user ID to internal user record (same pattern as the BBS example).
- `quotes` — `create`, `delete`, `random`, `search`, `list` calls. Uses component `state` for an in-memory search index. Uses component `config` for per-instance settings.

#### Configuration

- Base directory is `app`.
- `app/discord/config.toml` — Token (placeholder), application ID (placeholder), optional guild ID for dev-only command registration.
- `app/quotes/config.toml` — `board_channel_id`, `reaction_emoji`, `reaction_threshold`, `max_quotes_per_user`.

### Gateway API patterns the example must surface

- Declarative command definitions with ArkType option schemas (parallel to Fastify route schemas).
- Declarative event handler registration.
- Persistent interaction routing by custom ID pattern.
- Autocomplete handler co-located with its command definition.
- Handler context with `call()`, raw discord.js `interaction`/`message`/`client`, and no wrapper types.
- Embeds and action rows built with discord.js directly (not gateway helpers).

## Out of Scope

- Implementing `peranto-discord` package internals (that is t0010).
- Voice, sharding, or clustering.
- Real credentials or deployment configuration.
- Rate limiting, permission system, or moderation.
- LLM or external API integration.

## Dependencies

- None. This task produces a non-compiling API sketch that informs t0010.
