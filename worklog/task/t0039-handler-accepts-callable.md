+++
id = "t0039"
title = "Handlers accept a bare callable in addition to { handle() }"
status = "pending"
tags = ["component", "api", "ergonomics"]
modifies = ["s0003"]
blocked_by = []
+++

## Context

A component handler must currently be an object with a `handle` method
(`handlers: { name: { handle(ctx, input) {…} } }`, s0003 Types). Downstream review (new.r-g.kr)
asks that a handler also accept a bare callable (`handlers: { name(ctx, input) {…} }` or
`name: (ctx, input) => …`), dropping the `{ handle }` wrapper for the common case.

## Scope

- s0003: the `handlers` entry type accepts either a callable `(context, input) => Promisable<unknown>`
  or the existing `{ handle(...) }` object; both still infer input/output from the call declarations.
- Core implementation: normalize a callable entry to the internal handler shape in `defineComponent`;
  the object form keeps working (no break).
- Tests derive from the spec: both forms dispatch identically.

## Out of scope

- Call-name casing in examples — t0040.

## Notes

- Behavioral API addition; surface to the user before implementing. Keep the object form (it leaves
  room for future per-handler metadata) as the non-sugar path.
