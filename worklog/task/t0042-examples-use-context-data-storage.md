+++
id = "t0042"
title = "Examples use context.data for storage instead of hand-rolled CWD-relative fs"
status = "done"
tags = ["examples", "data", "drift"]
modifies = ["s0012", "s0014"]
blocked_by = []
+++

## Context

The fastify-web-server and discord-chatbot examples hand-rolled `storage.ts` over raw
`node:fs/promises` and read/write JSONL via a process-relative `DATA_PATH = "data/*.jsonl"`,
ignoring the component context's data access (s0021) and fluent-fs (s0022) — both of which landed
(t0028) after the examples were written (t0019/t0022/t0026). Every handler discarded `context`
(`_context`). Examples teach the framework, so they must model `context.data`.

## Approach

Preserve the spec'd persistence model — append-only JSONL, per request, no in-memory caching — but
route all I/O through `context.data` so files land under each component's data directory
(`{base_dir}/{component_id}/data/`) instead of a CWD-relative `data/`:

- Reads: `context.data.read(subpath).optional().text()` (drops the manual ENOENT handling).
- Full rewrites: `context.data.write(subpath).text(...)` (drops the manual mkdir + writeFile).
- Appends: fluent-fs (s0022) has no append primitive, so append stays on `node:fs` but targets
  `context.data.resolve(subpath)` rather than a process-relative constant.
- `storage.ts` helpers take a `DataAccess` plus a subpath; handlers pass `context.data` and use
  `context` (no more `_context`).

Whole-file JSON via `.json()` was rejected: it would abandon append-only JSONL for a
rewrite-on-every-write model — worse guidance for a "production-grade" example and a larger spec
change. Override if you'd rather the examples showcase `.json()`/`.optional().json(schema)`.

## Scope

- s0012, s0014: "Persistent storage" now describes component-scoped data dirs resolved via s0021,
  not a flat process-relative `data/`. Record schemas unchanged. (Done.)
- examples/fastify-web-server: storage.ts, comments.ts, threads.ts, users.ts. (Done.)
- examples/discord-chatbot: storage.ts, quotes/component.ts, users.ts. (Done.)

## Out of scope

- camelCase call-name rename — t0040.
- discord.js deprecation sweep — t0041.

## Notes

- Append-only JSONL is deliberate; s0022 lists directory/append ops under Anticipated Changes — when
  those land, the append helper can drop to the fluent API too.
