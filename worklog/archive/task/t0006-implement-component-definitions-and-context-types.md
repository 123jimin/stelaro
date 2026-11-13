+++
id = "t0006"
title = "Implement component definitions and context types"
status = "done"
tags = ["component", "context", "config", "errors"]
modifies = ["s0005", "s0009", "s0012"]
blocked_by = ["t0003", "t0004", "t0005"]
+++

# Implement component definitions and context types

Implement `defineComponent` and the component and context types in s0005.
Support function and object handlers, state factories, and the declared lifecycle hooks.
Add the component-author errors in s0012.

## Schema declarations

The optional `config` and `secrets` fields each hold an ArkType schema, as specified in s0005 and s0009.

## Completion criteria

- Compile representative definitions and verify that handlers infer input and output types from their call declarations.
- Verify that `context.call` is narrowed by `uses` and that state, config, and secrets appear with inferred types only when declared. Include type checks for rejected calls and undeclared capabilities.
- Verify that `ComponentNotReadyError` and `UserFacingError` follow the shared error contract, including the user message and optional cause.
- Document public types, helpers, and errors under s0004.

## Verification

- TypeScript and ESLint passed using the installed tools. The pinned pnpm version was unavailable in the local Corepack cache.
- The compiled suite passed on Windows with 39 passing tests and three existing filesystem skips.
- Tests cover both handler forms, lifecycle hook context types, ArkType input and output inference, independent capability declarations, and structured component-author errors.
- Type checks against the emitted declarations rejected calls outside `uses`, invalid inputs and handler results, undeclared context capabilities, missing handlers, and local schemas used as configuration.
