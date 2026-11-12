+++
id = "t0009"
title = "Implement the internal lifecycle controller"
status = "done"
tags = ["application", "lifecycle", "errors"]
modifies = ["s0006"]
+++

# Implement the internal lifecycle controller

Implement the private `LifecycleMachine` for s0006.
`createLifecycleMachine()` initializes state to `idle` and exposes `applyTransition` with caller-supplied source states.
The application runtime drives those transitions and manages component startup, shutdown, and cleanup in t0010.

## Completion criteria

- Verify initial state, independent instances, and the transition paths defined in s0006.
- Verify that invalid transitions preserve state and report the attempted operation and current state through `LifecycleStateError`.
- Document the public lifecycle error under s0004. Integrate reload transitions in t0011.

## Verification

- TypeScript and ESLint passed using the installed tools.
- The compiled Node.js suite passed on Windows with 28 passing tests and three existing filesystem skips.
- Lifecycle tests cover caller-supplied source states, independent machines, and invalid transitions that preserve state and report the structured error fields.
