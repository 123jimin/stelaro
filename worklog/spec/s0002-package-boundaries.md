+++
id = "s0002"
title = "Package Boundaries"
tags = ["architecture", "packages", "logging"]
paths = ["packages/stelaro/**", "packages/stelaro-pino/**"]
+++

# Package Boundaries

## Package responsibilities (UNIMPLEMENTED)

- `packages/stelaro` owns application lifecycle, component registration, typed component calls, configuration, and the logging contract.
- `packages/stelaro-pino` adapts a caller-configured Pino logger to the core logging contract. See s0013 and s0014.

## Dependency boundaries

- Core MUST NOT depend on Pino or the Pino adapter.
- The Pino adapter MAY depend on core and Pino.
- Structured logging backends belong in separate packages.
- Core MUST NOT depend on gateway runtimes or require raw gateway objects.
- Public design SHOULD NOT assume unspecified configuration or component behavior.
