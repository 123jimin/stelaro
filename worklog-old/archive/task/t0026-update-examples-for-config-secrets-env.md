+++
id = "t0026"
title = "Update examples to use config, secrets, and env overlays"
status = "done"
tags = ["examples", "config", "fastify", "discord"]
modifies = ["s0008"]
blocked_by = []
+++

## Motivation

Config, secrets, and environment overlays (t0011) landed after the examples were written. The discord bot stores its token in a plain `config.toml`, and the fastify server hardcodes mock OAuth credentials as string literals. Neither example uses `secrets.toml` or env overlays.

## stelaro-discord gateway library change

`defineDiscordGateway` in `packages/stelaro-discord/src/gateway.ts` currently bundles `token` into `DiscordGatewayConfig` (the `config` schema). The inner `defineComponent` call already supports a `secrets` field — it just isn't used.

- Split `DiscordGatewayConfig` into two schemas:
  - `DiscordGatewayConfig`: `application_id` (string), `guild_id?` (string). Stays on `config`.
  - `DiscordGatewaySecrets`: `token` (string). Goes on `secrets`.
- In `start(context)`, change the two `context.config.token` reads (line 90: `REST.setToken`, line 127: `client.login`) to `context.secrets.token`.
- `context.config.application_id` and `context.config.guild_id` references stay unchanged.

## discord-chatbot example

After the library change above, the example's base directory layout needs to match.

- Move `token` out of `app/discord/config.toml` into `app/discord/secrets.toml`.
- `app/discord/config.toml` retains `application_id` and optionally `guild_id`.
- Add `app/discord/secrets.dev.toml` with a placeholder dev bot token to demonstrate env overlays.
- Add `app/quotes/secrets.toml` (empty or with a placeholder) to show the pattern at component level.

## fastify-web-server

The fastify example has no `base_dir`, no config schemas, no secrets schemas. `auth.ts` hardcodes four OAuth literals and a zeroed session key inline.

- Add `base_dir` to `createApplication` call in `index.ts` (e.g., `base_dir: "app"`).
- Create base directory layout: `app/config.toml`, `app/secrets.toml`.
- Add an application-level `secrets` schema to `defineApplication` for OAuth credentials (`google_client_id`, `google_client_secret`, `discord_client_id`, `discord_client_secret`, `session_key`).
- Refactor `auth.ts` so `registerAuth` receives secrets (either from application secrets passed in, or through a component with a secrets schema) instead of hardcoding them.
- Populate `app/secrets.toml` with placeholder values matching the current mock strings.
- Add `app/config.dev.toml` or `app/secrets.dev.toml` to demonstrate env overlays.

## Out of Scope

- Adding new example projects.
- `mini-stock-market` (placeholder only).
- Secrets encryption or vault integration.
- Changes to the config/secrets core implementation beyond what's needed for the discord gateway secrets schema (if applicable).
