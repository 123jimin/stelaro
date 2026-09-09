+++
id = "s0009"
title = "CLI Arguments"
tags = ["cli", "application"]
paths = ["packages/stelaro/src/cli/**"]
+++

## Behavior

- Core defines, parses, and validates a fixed argument set during application
  creation and before configuration loading.
- Parsed arguments are exposed on the application runtime, remain immutable,
  and are unaffected by configuration reload.

| Argument | Type | Default | Purpose |
| --- | --- | --- | --- |
| `--base-dir` | string | `undefined` | Override the base directory. |
| `--env` | string | `null` | Select the active environment. |

## Constraints

- Applications MUST NOT declare custom CLI argument schemas.
- Parsing belongs to core, MUST NOT depend on gateway runtimes, and MUST finish
  before configuration loading.

## Anticipated Changes

- The parser may be replaced. Additional core arguments, help text, and
  environment-variable fallbacks may be specified later.
