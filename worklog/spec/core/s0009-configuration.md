+++
id = "s0009"
title = "Configuration"
tags = ["application", "component", "config", "context"]
paths = ["packages/stelaro/src/config/**"]
+++

# Configuration

## Configuration contract (UNIMPLEMENTED)

### Declaration and startup

- Components may declare ArkType schemas for configuration and secrets.
  - Schema defaults supply missing fields.
- At startup, the application loads each component's TOML configuration and secrets from the directories in s0008 and validates them before any component start hook runs.
- The application skips a configuration or secrets file when the component has no corresponding schema.
- A missing secrets file for a declared schema produces a warning and validates an empty object.
- A startup validation failure fails startup and moves the application to `failed` (s0006).

### Environment overlays

- When `--env` or `ApplicationOptions.env` selects an environment (s0007), the application loads its configuration and secrets overlays after their base files.
- `recursiveMerge` deep-merges overlays onto base values.
  - Overlays contain environment-specific differences, and their fields win on conflict.
  - The application ignores missing overlays and validates the merged result.

### Exposure

- The application exposes validated configuration and secrets only through the declaring component's context (s0005).
  - Their types come from the corresponding schemas, and undeclared values are absent.

### Reload

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

### Errors

- `ConfigFileError` and `SecretsFileError` report unreadable files.
- `ConfigValidationError` and `SecretsValidationError` report schema failures.

## Constraints

- Configuration belongs to core and MUST NOT depend on gateway runtimes.
- The application MUST validate configuration and secrets before exposing them to component behavior.
- Configuration and secrets MUST remain scoped to their declaring component.
  - Secrets files MUST NOT be committed (s0008).

## Anticipated changes

- File watching, remote providers, and separate secrets reloading may be specified later.
