+++
id = "s0014"
title = "Discord Chatbot Example"
tags = ["examples"]
paths = ["examples/discord-chatbot/**"]
+++

## Behavior

### Domain and interactions

- The example is a Quote Board Discord bot built only from public Stelaro APIs.
  Users save messages, search and list quotes, or request a random quote.
- `/quote random [user]`, `/quote search <query>`, and `/quote list [user]`
  provide random, searchable/autocompleted, and paginated results.
- The `Save as Quote` message context menu saves its target.
- `messageReactionAdd` auto-saves a message and posts it to the board channel
  after the configured emoji reaches its threshold. The gateway obtains emoji
  and threshold through a component call.
- `quote:delete:<quote_id>` deletes only when invoked by the user who saved the
  quote. `quote:list:<user_filter>:<page>` changes pages; pagination state is
  encoded in the custom id rather than stored server-side.

### Components and gateway

- `users` resolves a Discord user id to an internal user and creates it on
  first sight.
- `quotes` exposes create, delete, random, search, list, and
  `getReactionConfig`; its config contains board channel, reaction emoji,
  threshold, and maximum quotes per user.
- Quote commands, events, and interactions are co-located with `quotes`. The
  Discord gateway is a thin shell listing component-owned mount groups.
- Gateway handlers receive raw discord.js interactions/events plus typed
  Stelaro `call`. They build embeds and action rows directly with discord.js.

### Storage and configuration

- Components perform uncached per-request reads and append-only JSONL writes
  under their s0021 component data directories.
- `users/users.jsonl` stores `user_id`, `discord_user_id`, `display_name`, and
  `created_at`.
- `quotes/quotes.jsonl` stores `quote_id`, `content`,
  `author_discord_user_id`, `author_display_name`, `saved_by_user_id`,
  `saved_by_discord_user_id`, `source_message_id`, and `created_at`.
- Under base directory `app`, `discord/config.toml` provides `token`,
  `application_id`, and optional development `guild_id`; `quotes/config.toml`
  provides `board_channel_id`, `reaction_emoji`, `reaction_threshold`, and
  `max_quotes_per_user`.

## Constraints

- Credentials and tokens MUST remain placeholders.
- Gateway handlers MUST retrieve component configuration through calls, not
  direct access.
- Discord UI MUST use discord.js builders rather than gateway wrappers.
