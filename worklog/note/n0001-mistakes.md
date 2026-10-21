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
| t0008 | `worklog/task/t0008-route-groups-read-gateway-configuration.md` | Design `config` on route groups | Typed the optional schema parameter as `GatewayConfigSchema \| undefined` with `undefined` defaults, after reading AGENTS.md's "prefer `null` over `undefined`" and with tooltool's `Nullable` already imported in the file being changed. Check new type parameters against the nullability rule, not against the neighbouring code's older habits. |
| t0008 | `worklog/task/t0008-route-groups-read-gateway-configuration.md` | Design the handler's configuration accessor | Named the method `config`, a noun, beside `call`, `redirect`, and `html`, and the same word as the schema field on groups and the gateway. A function is a verb phrase: `getConfig`. |
| s0016, t0008 | `packages/stelaro-fastify/src/index.ts` | Per-route inference helper; later, configuration for route groups | `defineFastifyRoute` returns bare `GatewayRoute`, discarding the `TParams`, `TBody`, and `TQuerystring` it inferred, and a comment presents the erasure as a given. t0008 then designed a schema-witness accessor and an error class around it instead of removing it. An inference helper returns what it inferred; a lone route's unknowable `TUses` is the one parameter to leave wide. Every later feature that needs a type on a route pays for this erasure. |
