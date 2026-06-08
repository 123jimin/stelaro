+++
id = "t0040"
title = "camelCase call names in examples (and document the convention)"
status = "pending"
tags = ["examples", "convention", "naming"]
modifies = ["s0003", "s0014"]
blocked_by = []
+++

## Context

Example components use snake_case call names — e.g. `list_by_thread` (fastify-web-server `comments`)
— but a call name is a callable and the naming convention is camelCase for callables (AGENTS.md). The
examples teach the framework, so they should model the convention.

## Scope

- Rename snake_case call names to camelCase across the examples (declarations in
  `defineComponentCalls`, handler keys, and call sites). The full set is two:
  `list_by_thread` -> `listByThread` (declared `comments.ts`, called `threads.ts`) and
  `get_reaction_config` -> `getReactionConfig` (declared `quotes/calls.ts`, `quotes/component.ts`,
  called `quotes/mounts.ts`). All other example call names are already single lowercase words.
- Audit the example packages with code (fastify-web-server, discord-chatbot) for snake_case call
  names; mini-stock-market is an empty stub (`.gitkeep` only; s0013 is fully UNIMPLEMENTED) with
  nothing to audit. Update example spec wording that names a renamed call: s0014 names
  `get_reaction_config` in its Components behavior, so this task also modifies s0014. (s0012 says
  "list-by-thread behavior" only as prose, not the literal call token — verify but likely no change.)
- **Specify call-name casing in s0003** (call names follow the camelCase callable convention),
  mirroring s0003's existing "component ids must be lowercase kebab-case" constraint: a call name is
  part of the typed public call surface (`Calls.calls.<name>`), so its format is a spec-worthy
  constraint, not merely AGENTS.md style. (Applies the t08 lesson — a binding identifier-format
  constraint belongs in the spec; confirm before editing s0003.)

## Out of scope

- Callable-handler sugar — t0039.

## Notes

- Cross-refs the downstream project's t0011 (same convention, `get_info` -> `getInfo`).
- Renaming a call is an internal-identifier change only: it touches the `defineComponentCalls`
  declaration, the handler key, and `.calls.<name>` call sites. It does NOT change any HTTP route or
  Discord command — those are declared explicitly (fastify `path:`, discord `.setName(...)`) and are
  not derived from call names. (Verified: no gateway derives an endpoint/command from a call name.)
