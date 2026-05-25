+++
id = "s0009"
title = "CLI Arguments"
tags = ["cli", "application"]
paths = ["packages/stelaro/src/cli/**"]
+++

## Related Specs

- s0002: Application
- s0008: Configuration

## Behavior

- Stelaro defines a fixed set of CLI arguments.
- CLI arguments are parsed and validated during application creation.
- CLI argument parsing occurs before config file loading.
- Parsed CLI arguments are available on the application runtime.
- CLI arguments are immutable after application creation.
- CLI arguments are not affected by config reload.

### Fixed Arguments

| Argument | Type | Default | Purpose |
|----------|------|---------|---------|
| `--base-dir` | string | `undefined` | Override base directory path |
| `--env` | string | `null` | Set the active environment name |

## Constraints

- CLI arguments are defined by the core package; applications do not declare custom CLI argument schemas.
- CLI argument behavior belongs to the core package.
- CLI argument parsing must not depend on gateway-specific runtimes.
- CLI argument validation must complete before config loading begins.

## Anticipated Changes

- The underlying CLI parsing implementation may be replaced with a third-party library later.
- Additional core CLI arguments may be added as new core features are specified.
- Help text generation may be specified later.
- Environment variable fallbacks for CLI arguments may be specified later.

## Dangers

- Coupling CLI parsing to a specific third-party library would make the core harder to maintain.
- Adding too many core CLI arguments may crowd out gateway-specific argument needs.
