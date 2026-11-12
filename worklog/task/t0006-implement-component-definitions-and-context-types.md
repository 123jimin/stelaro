+++
id = "t0006"
title = "Implement component definitions and context types"
status = "pending"
tags = ["component", "context", "config", "errors"]
modifies = ["s0005", "s0009", "s0012"]
blocked_by = ["t0003", "t0004", "t0005"]
+++

# Implement component definitions and context types

Implement `defineComponent` and the component and context types in s0005.
Support function and object handlers, state factories, and the declared lifecycle hooks.
Add the component-author errors in s0012.

## Open spec decision

Resolve the public declaration shape for configuration and secrets in s0005 and s0009 before locking in its types.

## Completion criteria

- Compile representative definitions and verify that handlers infer input and output types from their call declarations.
- Verify that `context.call` is narrowed by `uses` and that state, config, and secrets appear with inferred types only when declared. Include type checks for rejected calls and undeclared capabilities.
- Verify that `ComponentNotReadyError` and `UserFacingError` follow the shared error contract, including the user message and optional cause.
- Document public types, helpers, and errors under s0004.
