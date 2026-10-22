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
| t0008 | `packages/stelaro-fastify/src/index.ts`, `index.spec.ts` | Document the configuration API | Wrote TSDoc as stacked clauses and inversions ("Returns the gateway's current configuration, which the handlers' `getConfig` serves"; "uses no components and declares no `config` on `server`"; "or `null` (default: `null`)"), and test titles with parenthetical asides ("also after a reload"). One plain sentence per fact: subject, verb, object; say what a thing is before what constrains it. |
| t0008 | `packages/stelaro-fastify/src/index.ts` | Document the configuration API | TSDoc restated what the signature or a neighbouring member already says: how `TConfig` is wired into `routes` beside the `NoInfer` that does it, "`null` when they read none" on a parameter whose constraint and default say so, and a `MountFastifyRoutesOptions` summary repeating its two member docs. A doc line states one fact a reader cannot get from the code at hand. |
| t0008 | `packages/stelaro-fastify/src/index.ts` | Give route handlers gateway configuration | Made configuration a per-route-group declaration: a schema on every group, a list on the gateway, an identity check between them, a `TConfig` parameter through six types, and two error classes. Configuration is the gateway's; a mount can take the gateway's `getConfig` as a function argument, and the parameter type checks coverage on its own. Hand a value to the code that needs it before building a declaration for it. |
| t0008 | `packages/stelaro-fastify/src/index.ts` | Shape the gateway's `config` | Kept `config` as an extension the library intersects with the listen settings after the human had asked for one declared schema; the objection (mount coverage could not be verified against a composed schema) belonged to the per-route design and died with it, and I did not re-check it when the design changed. When a constraint goes, re-derive the choices that rested on it. |
| t0008 | `worklog/task/t0008-route-groups-read-gateway-configuration.md` | Close the task | Ran `task finish` the moment tests passed, before the human had accepted the outcome; when the design then changed twice in the same session, opened t0009 for the corrections and set it `active` by hand. Human acceptance is part of the outcome: leave a task active until then, and fold a same-session correction into it rather than into a new task. |
| t0008 | `packages/stelaro-fastify/src/index.ts` | Hand configuration to route groups | Made mounts functions of the gateway's `getConfig`, called when the gateway is defined, though the configuration exists only after `start`; the getter was handed to code that could call it and get `undefined`, with a type saying otherwise. A mount does not need configuration; its handlers do, per request, so the value belongs on the handler context. Give a value to the code that runs when the value exists. |
| t0008 | `packages/stelaro-fastify/src/index.ts` | Widen `mountFastifyRoutes`' implementation signature | Spelled the options shape out inline, `{call?; getConfig?}`, instead of deriving it from `MountFastifyRoutesOptions` with `Partial<>`, duplicating the exported type's members. Derive a variant of a named type from the type. |
