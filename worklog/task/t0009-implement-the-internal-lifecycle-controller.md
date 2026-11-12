+++
id = "t0009"
title = "Implement the internal lifecycle controller"
status = "pending"
tags = ["application", "lifecycle", "errors"]
modifies = ["s0006"]
+++

# Implement the internal lifecycle controller (NEEDS APPROVAL)

Implement a private lifecycle controller for s0006.
Centralize operation guards, lifecycle transitions, and the record of components whose start hook has completed or was absent.
Accept components in dependency order so the controller can be verified independently of the registry and runtime wiring.

## Completion criteria

- Verify transitions for start and stop, including rejection of invalid or overlapping operations with `LifecycleStateError`.
- Verify that a failed start leaves successfully started components available for cleanup.
- Verify that stop attempts cleanup of every started component in reverse order, reaches `idle`, and rejects with an `AggregateError` when cleanup fails.
- Document the public lifecycle error under s0004. Integrate reload transitions in t0011.
