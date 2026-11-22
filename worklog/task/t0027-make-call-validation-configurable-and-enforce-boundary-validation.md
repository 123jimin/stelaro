+++
id = "t0027"
title = "Make call validation configurable and enforce boundary validation"
tags = ["application", "component", "fastify", "gateway", "errors"]
modifies = ["s0005", "s0006", "s0007", "s0017"]
status = "pending"
+++

# Make call validation configurable and enforce boundary validation (NEEDS APPROVAL)

Make in-process component call validation opt-in through `ApplicationOptions` while keeping HTTP call-transport inputs unconditionally validated at the Fastify boundary.
Reject disabling validation when a relevant call schema contains a morph, so handlers never receive unmorphed inputs or callers unmorphed outputs silently.

## Scope and design

- Add `validate_call_input?: boolean` and `validate_call_output?: boolean` to `ApplicationOptions` (both defaulting to `false`).
- Reject `validate_call_input: false` when any registered component call has an input schema with a morph, and reject `validate_call_output: false` when any registered component call has an output schema with a morph.
  - Prefer compile-time rejection via TypeScript types (e.g., checking whether `inferIn` and `infer` diverge, or ArkType morph metadata) if tractable without excessive type-checking cost; otherwise enforce at `createApplication` registration time with a dedicated `StelaroError` subclass (or combine both).
- In `createExposeCallsFactory` (`packages/stelaro-fastify/src/expose-calls.ts`):
  - Unconditionally validate `request.body` with `reference.input.assert(...)` before dispatching the call, throwing `RouteValidationError("body", cause)` directly on failure.
    This also fixes the defect where a nested recursive call to the same `(component_id, call_name)` could have its `CallInputError` misclassified as HTTP 400.
  - Add an optional `validate_call_output?: boolean` (default `false`) to `ExposeCallsFactoryOptions`, enforcing the same morph restriction when `false` and validating `output` when `true` (avoiding double validation when the application already validates outputs, or documenting exact interaction).
- Check whether any morphing input schemas in `examples/fastify-web-server` (such as `TrimmedNonEmptyString` on `users` and `threads` call inputs) need adjustment or explicit `validate_call_input: true`.

## Completion criteria

- Update `s0005`, `s0006`, `s0007`, and `s0017` (and `s0012` if a new core error class is added) for the new options, boundary validation behavior, and morph-rejection contract.
- Implement `validate_call_input` and `validate_call_output` in `packages/stelaro` with morph rejection (type-level if practical, runtime check otherwise or in addition).
- Implement unconditional input validation and configurable `validate_call_output` in `packages/stelaro-fastify`'s `createExposeCallsFactory`, eliminating the `CallInputError` `(component_id, call_name)` matching heuristic.
- Add unit and type tests covering:
  - default (`false`/`false`) skips input/output `assert` for non-morphing calls;
  - `true` validates input/output and preserves `CallInputError` / ArkType output error contracts;
  - morphing input/output schemas rejected when the corresponding flag is `false`, accepted when `true`;
  - `exposeCalls` always validates HTTP request body once, classifies only the route's own input failure as 400 (even under recursive calls), and respects `validate_call_output`.
- Pass `pnpm build`, `pnpm lint`, and `pnpm test`.
