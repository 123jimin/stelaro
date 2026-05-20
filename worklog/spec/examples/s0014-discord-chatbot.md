+++
id = "s0014"
title = "Discord Chatbot Example"
tags = ["examples"]
paths = ["examples/discord-chatbot/**"]
+++

## Related Specs

- s0010: Examples (Common)
- s0017: Discord Gateway

## Behavior

### Domain

- A "Quote Board" Discord bot built from public Stelaro APIs.- Users save memorable messages as quotes via context menu or slash commands. Quotes are searchable, listable, and randomly retrievable.- When a message receives enough reactions of a configured emoji, it is auto-saved as a quote and posted to a configured board channel.
### Commands

- `/quote random [user]` returns a random quote, optionally filtered by quoted user.- `/quote search <query>` searches quotes by content or author name. The `query` option provides autocomplete suggestions.- `/quote list [user]` lists quotes with pagination via Previous/Next buttons.- `Save as Quote` message context menu saves the target message as a quote.
### Events

- `messageReactionAdd` checks whether the message has reached the configured reaction threshold. If so, auto-saves as a quote and posts to the board channel. The reaction emoji and threshold are read from the quotes component via a call.
### Persistent interactions

- A Delete button on quote embeds (custom ID `quote:delete:<quote_id>`) deletes the quote if the invoking user is the one who saved it.- Pagination buttons on list embeds (custom ID `quote:list:<user_filter>:<page>`) update the embed with the requested page. Pagination state is encoded in the custom ID, not stored server-side.
### Components

- `users` resolves a Discord user ID to an internal user record, creating a record on first sight.- `quotes` provides create, delete, random, search, list, and get_reaction_config calls. Uses component config for board channel, reaction emoji, reaction threshold, and max quotes per user.- A Discord gateway composes mount groups from component files. The gateway file is a thin shell that lists mounts.- Mount groups are co-located with the component they primarily serve. Quote commands, events, and interactions live in the quotes module.- Gateway handlers receive raw discord.js interactions and events alongside typed Stelaro `call()`. Embeds and action rows are built with discord.js directly.
### Persistent storage

- Components read and write JSONL files directly per request, without in-memory caching.- Persistence uses append-only JSONL files under `data/`.- `data/users.jsonl` stores one user record per line with fields `user_id`, `discord_user_id`, `display_name`, `created_at`.- `data/quotes.jsonl` stores one quote record per line with fields `quote_id`, `content`, `author_discord_user_id`, `author_display_name`, `saved_by_user_id`, `saved_by_discord_user_id`, `source_message_id`, `created_at`.
### Configuration

- Base directory is `app`.
- `app/discord/config.toml` provides `token`, `application_id`, and optional `guild_id` for dev-only command registration.- `app/quotes/config.toml` provides `board_channel_id`, `reaction_emoji`, `reaction_threshold`, `max_quotes_per_user`.
## Constraints

- The example must build only from public Stelaro APIs.
- The example must not contain real Discord credentials or tokens.
- Gateway handlers must not access component config directly — they must use `call()` to retrieve configuration-dependent values.
- Embeds, buttons, and other Discord UI must be built with discord.js builders directly, not gateway wrappers.

## Anticipated Changes

- None recorded.

## Dangers

- Replacing placeholder credentials with real ones would make the example unsafe to reuse.
- Adding behavior beyond the approved Quote Board scope would make the example imply unsupported behavior.
- Accessing component config directly from gateway mounts would bypass the component boundary and create hidden coupling.
