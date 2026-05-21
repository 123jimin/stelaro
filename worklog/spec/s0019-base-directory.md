+++
id = "s0019"
title = "Base Directory"
tags = ["application", "config"]
paths = []
+++

## Related Specs

- s0002: Application (`ApplicationOptions.base_dir`)
- s0008: Configuration
- s0009: CLI Arguments (`--base-dir`)

## Behavior

### Definition

- The base directory is the root of an application instance's filesystem state.
- The default base directory is the working directory.
- The base directory path may be overridden at application creation via `ApplicationOptions.base_dir`.
- The base directory path may be overridden via the `--base-dir` CLI argument.

### Layout

- `config.toml` — application-level configuration.
- `{component_id}/` — per-component subdirectory.
- `{component_id}/config.toml` — component-level configuration.

## Constraints

- All file paths resolved by the application are relative to the base directory.
- Specs that introduce new files or subdirectories under the base directory must declare their paths here.

## Anticipated Changes

- Per-component data, template, or secret directories.
- Application-level data, template, or secret directories.

## Dangers

- Scattering layout knowledge across specs makes it hard to reason about the full directory tree.
