+++
id = "t0010"
title = "Implement the application runtime and call dispatch"
status = "pending"
tags = ["application", "component", "context", "lifecycle"]
modifies = ["s0005", "s0006", "s0007", "s0008", "s0009", "s0011", "s0013"]
blocked_by = ["t0007", "t0008", "t0009"]
+++

# Implement the application runtime and call dispatch (NEEDS APPROVAL)

Implement `defineApplication` and `createApplication` under s0006.
Integrate the registry, startup options, directory resolution, validated config and secrets, lifecycle controller, and component-scoped capabilities.
Use one dispatch implementation for application and component calls, applying the applicable call-surface and lifecycle checks.

## Open spec decision

Clarify how the lifecycle call guard applies to `context.call` inside start and stop hooks, including local-value cleanup in s0005.

## Completion criteria

- Verify that startup loads and validates config and secrets before any component start hook, and that startup failure moves the application to `failed`.
- Verify application and component data roots, scoped loggers, and context access to only the declared config and secrets.
- Verify state isolation across components and application runtimes, and persistence across stop/start within one runtime.
- Verify that registered application calls and declared context calls infer their types and dispatch both handler forms.
  Verify unregistered and undeclared call errors, input wrapping with the original cause, unchanged output errors, and local-value passthrough.
- Document the public application API and errors under s0004. Complete reload and signals in t0011 and t0012.
