+++
id = "t0017"
title = "Implement CLI argument parsing"
status = "pending"
tags = ["cli", "application"]
modifies = ["s0002", "s0009"]
+++

## Scope

- Implement parsing and validation of Peranto's fixed CLI arguments during application creation.
- Expose parsed CLI arguments on the application runtime.
- Ensure CLI argument parsing completes before config loading.
- Update affected specs with approved behavior, leaving `UNIMPLEMENTED` markers where related behavior remains out of scope.

## Out of Scope

- Custom application-defined CLI argument schemas.
- Subcommand parsing.
- Help text generation.
- Environment variable fallbacks.
- Gateway-specific CLI arguments.
