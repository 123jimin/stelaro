+++
id = "t0030"
title = "Optimize core dispatch and fluent filesystem write path"
tags = ["application", "component", "fs", "fastify"]
modifies = ["s0006", "s0010", "s0017"]
status = "pending"
blocked_by = ["t0027", "t0029"]
+++

# Optimize core dispatch and fluent filesystem write path (NEEDS APPROVAL)

Eliminate avoidable per-call, per-request, and per-write allocations and syscalls across core dispatch, Fluent FS writes, and Fastify route handling without changing public behavior.

## Scope and design

- Pre-bind component call dispatch tables at `createApplication` time (`packages/stelaro/src/application/`):
  - Index each component's declared `uses` references in a single `Map<AnyComponentCallReference, BoundCallEntry>` pointing directly to the target instance and registered handler, replacing the 4-lookup chain (`dependencies.get(id)?.get(name)` -> `instances.get(id)` -> `calls.get(name)`).
  - Flatten the multi-layer `async` wrappers across `context.call`, `app.call`, and `dispatchCall` so a single async boundary handles invocation (and synchronous rejection/exception semantics remain promise-rejecting).
- Avoid redundant `mkdir(..., {recursive: true})` syscalls in `packages/stelaro/src/fs/writer.ts`:
  - Attempt `writeFile` first and create parent directories + retry only on `ENOENT`.
- Avoid per-request closure allocations in `packages/stelaro-fastify/src/route.ts`:
  - Replace the per-request object literal with fresh `redirect`/`html` closures using a lightweight prototype/class-backed context object, preserving all readonly fields and method semantics.

## Completion criteria

- Implement pre-bound dispatch lookup and flattened async call path in `packages/stelaro/src/application/`.
- Update `packages/stelaro/src/fs/writer.ts` to use `ENOENT`-fallback `mkdir`.
- Update `packages/stelaro-fastify/src/route.ts` to avoid per-request `redirect`/`html` closure allocation.
- Verify all existing lifecycle, hook-scope, error-type, write-serialization, and route tests continue to pass, adding targeted regression tests for `ENOENT` directory creation and synchronous-throw-to-rejection preservation if needed.
- Confirm `s0006`, `s0010`, and `s0017` remain accurate with no unintended behavior changes.
- Pass `pnpm build`, `pnpm lint`, and `pnpm test`.
