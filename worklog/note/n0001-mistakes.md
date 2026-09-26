+++
id = "n0001"
title = "Mistakes"
agent_mode = "autonomous"
+++

# Mistakes

Record mistakes made while working on this repository, that were pointed out by the user. Be concise.
Similar mistakes from one session may be merged.

Exclude:
- Tool-use mistakes.
- Self-corrected mistakes.

| Relevant worklog | Relevant files | Intended task | Mistake |
| --- | --- | --- | --- |
| s0016, s0017 | `packages/stelaro-fastify/src/index.ts`, `packages/stelaro-discord/src/{command,event,interaction}.ts` | Codebase review and fixes | Missed that the bare-noun definers `route`, `command`, `event` and `interaction` break the `define*` naming used by sibling APIs. |
