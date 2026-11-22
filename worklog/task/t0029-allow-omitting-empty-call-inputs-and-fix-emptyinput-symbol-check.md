+++
id = "t0029"
title = "Allow omitting empty call inputs and fix EmptyInput symbol check"
tags = ["component", "application"]
modifies = ["s0005", "s0006"]
status = "pending"
+++

# Allow omitting empty call inputs and fix EmptyInput symbol check

Align core `ComponentCallFn` with the browser client's `CallFunction` by making the input argument optional when `{}` is accepted, and fix `EmptyInput` to reject own symbol properties as declared by its type.

## Scope and design

- Update `ComponentCallFn` in `packages/stelaro/src/component/calls.ts` so callers can omit the input argument when `Record<never, never> extends CallInput<TCall>` (matching `@jiminp/stelaro-fastify/client`'s `CallFunction`).
- Default an omitted input argument to `{}` at runtime in `app.call` and `context.call` dispatch before validation/handler invocation.
- Fix `EmptyInput` in `packages/stelaro/src/component/schema.ts` to check `Reflect.ownKeys(value).length === 0` instead of `Object.getOwnPropertyNames(value).length === 0`, so own symbol keys are rejected consistently with its `Type<Record<string | symbol, never>>` type.

## Completion criteria

- Update `s0005` (and `s0006` if `app.call` signature is updated) to reflect optional input arguments when `{}` is accepted.
- Update `ComponentCallFn`, dispatch defaulting, and `EmptyInput` in `packages/stelaro`.
- Add type and runtime tests verifying:
  - `EmptyInput` and all-optional object calls accept omitted input and pass `{}` to the handler;
  - calls requiring fields or non-object inputs (including `null`) still require the argument at compile time;
  - `EmptyInput` rejects objects with own symbol properties.
- Pass `pnpm build`, `pnpm lint`, and `pnpm test`.
