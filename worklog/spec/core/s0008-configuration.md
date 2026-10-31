+++
id = "s0008"
title = "Configuration"
tags = ["config", "application", "component", "context"]
paths = ["packages/stelaro/src/config/**"]
+++

## Behavior

### Declaration and startup

- Components may declare Arktype schemas for configuration and secrets. Schema
  defaults supply missing fields.
- During `start()` (s0002), each component's TOML configuration and secrets
  are loaded from the config and secrets directories (s0019) and validated
  before any component `start` hook runs.
- Components without the relevant schema require no file and are skipped.
- A component with a configuration schema requires its base configuration
  file, even when an environment overlay exists; a missing one is a
  `ConfigFileError`. A missing secrets file for a declared schema produces a
  warning and validates an empty object.
- Any file or validation failure during `start()` (s0007) makes it reject and
  moves the application to `failed`.

### Environment overlays

- When `--env` or `ApplicationOptions.env` selects an environment, its overlay
  files are loaded after base files for component configuration and secrets.
- `recursiveMerge` deep-merges overlays onto base values; overlay fields win.
  A missing overlay is ignored, and the merged result is validated.

### Exposure

- Validated component configuration and secrets are exposed only through that
  component's context and are typed from its schemas. Undeclared values are
  absent.

### Reload

- `reloadConfig()` is valid only while `active`. It reads and validates every
  configuration file before changing any reference. A file or validation
  failure keeps all old values.
- After successful validation, all configuration references are swapped, then
  component `onConfigReload` hooks run concurrently. Every component hook runs
  to completion even when another fails.
- Component hook failures are returned together in an `AggregateError`, move
  the application to `failed`, and prevent the application hook from running.
  The application `onConfigReload` runs only after all component hooks succeed;
  its failure also moves the application to `failed`.
- `reloadComponentConfig(component_id)` is valid only while `active`; its id
  type MUST be narrowed to registered components. It validates before swapping
  only the target's reference, then invokes only that component's reload hook.
  A file or validation failure preserves the old value.
- Both reload methods return `void`. Neither reloads secrets.

## Constraints

- Configuration belongs to core and MUST NOT depend on gateway runtimes.
- Configuration and secrets MUST be validated before component behavior can
  receive them.
- Component configuration and secrets MUST remain scoped to their declaring
  component.

## Anticipated Changes

- File watching, remote providers, and separate secrets reloading may be
  specified later.

## Dangers

- Secrets files MUST NOT be committed to version control.
