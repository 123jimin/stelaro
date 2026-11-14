+++
id = "t0013"
title = "Implement the Stelaro Pino package"
status = "done"
tags = ["packages", "pino", "logging"]
modifies = ["s0002", "s0014"]
blocked_by = ["t0004"]
+++

# Implement the Stelaro Pino package

Create the `@jiminp/stelaro-pino` workspace package with a TypeScript project, package exports, and a public entry point.
Use the core logging contract and Pino's own `Logger` type under s0002, s0003, and s0014.
Implement `definePinoLogger` against the caller-supplied Pino root.

## Completion criteria

- Verify that each scope has the `component` binding and that `childPinoLogger` returns a new Pino child with that binding.
- Verify level mapping and filtering, preservation of root bindings and serializers, and use of the caller's configuration.
- Verify structured records for leading objects and errors, and console-compatible message composition for remaining arguments and other argument shapes.
- Verify that workspace build, lint, and test commands include the adapter and that core stays independent of Pino.
- Document the public adapter under s0004.
