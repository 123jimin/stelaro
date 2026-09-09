+++
id = "t0041"
title = "Sweep deprecated discord.js APIs (ephemeral, setDMPermission)"
status = "done"
tags = ["chore", "discord", "deprecation"]
modifies = []
blocked_by = []
+++

## Context

discord.js resolves to 14.26.4 in this workspace. Two APIs in use are `@deprecated` in the installed
typings:

- `InteractionReplyOptions.ephemeral` -> use `flags: MessageFlags.Ephemeral`.
- `*CommandBuilder.setDMPermission()` -> use `setContexts(...)`.

Both are deprecation swaps with identical runtime behavior, so no spec behavior changes.

## Scope

- examples/discord-chatbot `quotes/mounts.ts`: `ephemeral: true` (5 sites) -> `flags: MessageFlags.Ephemeral`;
  `.setDMPermission(false)` -> `.setContexts(InteractionContextType.Guild)`.
- packages/stelaro-discord `middleware/reply.ts`: `ephemeral: true` payload -> `flags: MessageFlags.Ephemeral`.
- `guard.ts` / `rate-limit.ts` mention "ephemeral" only in doc-comment prose — no code change.

## Out of scope

- camelCase call-name rename — t0040.
- context.data storage modernization — t0042.

## Notes

- `modifies` empty: behavior (ephemeral replies, guild-only command) is unchanged; only the
  non-deprecated API token differs. Governed behavior in s0014 and s0017 is untouched.
- No `fetchReply` (also deprecated -> `withResponse`) usages exist in the codebase.
