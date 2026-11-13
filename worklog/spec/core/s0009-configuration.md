+++
id = "s0009"
title = "Configuration"
tags = ["application", "component", "config", "context"]
paths = ["packages/stelaro/src/config/**"]
+++

# Configuration

## Schema declarations

- Components declare ArkType schemas through the separate optional `config` and `secrets` fields in s0005.
  Each declaration adds the corresponding validated value to the component's context type.

## Loading

- Loading skips configuration or secrets when the component has no corresponding schema.
- A declared configuration schema requires a base file. If it is missing, loading raises `ConfigFileError` before reading the overlay or validating the schema.
- A missing secrets base file produces a warning and uses an empty base table.
- When an environment is selected (s0007), loading reads its overlay after the base file and ignores a missing overlay.
  `recursiveMerge` merges nested TOML tables and uses the overlay value on conflicts between other values, including arrays and dates.
- The schema validates the merged value once. Schema defaults supply missing fields.
- `ConfigFileError` and `SecretsFileError` report read and TOML parse failures with `component_id`, `file_path`, and the original `cause`.
- `ConfigValidationError` and `SecretsValidationError` report schema failures with `component_id` and the original `cause`.

## Application startup and exposure (UNIMPLEMENTED)

- At startup, the application loads and validates each component's configuration and secrets from the directories in s0008 before any component start hook runs.
- A startup validation failure fails startup and moves the application to `failed` (s0006).
- The application exposes each validated value only through the declaring component's context (s0005).
  - Their types come from the corresponding schemas, and undeclared values are absent.

## Reload (UNIMPLEMENTED)

- `reloadConfig()` reads and validates every configuration file before changing any reference.
  - If validation fails, all previous values remain in place.
- After successful validation, all configuration references are swapped.
  - Component `onConfigReload` hooks then run concurrently, and every hook runs to completion even when another fails.
- If any component hooks fail, `reloadConfig()` rejects with an `AggregateError` containing their failures and skips the application hook.
  - The application `onConfigReload` hook runs only after all component hooks succeed.
  - See s0006 for lifecycle transitions when a reload hook fails.
- `reloadComponentConfig(component_id)` MUST narrow its ID type to registered components.
  - It validates before swapping only the target's configuration reference, then invokes only that component's reload hook.
  - A validation failure preserves the old value.
- Both methods resolve with no value and leave secrets as loaded at startup.
  - See s0006 for valid lifecycle states.

## Constraints

- Configuration belongs to core and MUST NOT depend on gateway runtimes.
- The application MUST validate configuration and secrets before exposing them to component behavior.
- Configuration and secrets MUST remain scoped to their declaring component.
  - Secrets files MUST NOT be committed (s0008).

## Anticipated changes

- File watching, remote providers, and separate secrets reloading may be specified later.
