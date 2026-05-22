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
- `secrets.toml` — application-level secrets. Must not be committed to version control.
- UNIMPLEMENTED `data/` — application-level templates and text data.
- `config.{env}.toml` — environment-specific configuration overlay, deep-merged onto `config.toml`.
- `secrets.{env}.toml` — environment-specific secrets overlay, deep-merged onto `secrets.toml`.
- `{component_id}/` — per-component subdirectory.
- `{component_id}/config.toml` — component-level configuration.
- `{component_id}/secrets.toml` — component-level secrets.
- UNIMPLEMENTED `{component_id}/data/` — component-level templates and text data.
- `{component_id}/config.{env}.toml` — component environment-specific configuration overlay.
- `{component_id}/secrets.{env}.toml` — component environment-specific secrets overlay.

### Initialization

- UNIMPLEMENTED The application can initialize the base directory, creating empty config and secrets files for the application and all registered components.

### Environment Overlays

- Environment overlay files (`config.{env}.toml`, `secrets.{env}.toml`) contain only fields that differ from the base file.
- Overlay values are deep-merged onto the base file. Overlay fields take precedence.
- Missing overlay files are silently skipped.

## Constraints

- All file paths resolved by the application are relative to the base directory.
- Specs that introduce new files or subdirectories under the base directory must declare their paths here.

## Anticipated Changes

- Locale-specific subdirectories within `data/`.

## Dangers

- Scattering layout knowledge across specs makes it hard to reason about the full directory tree.
