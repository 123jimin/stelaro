+++
id = "t0020"
title = "Restructure config directory to app base directory"
status = "pending"
tags = ["config", "cli", "application"]
modifies = ["s0008", "s0009"]
blocked_by = []
+++

## Scope

### Concept

- Replace the flat "config directory" with a structured "base directory".
- `base_dir/config.toml` for application config (was `config_dir/application.toml`).
- `base_dir/{component_id}/config.toml` for component config (was `config_dir/{component_id}.toml`).
- Per-component subdirectories prepare for future per-component data, templates, and other files.
- Base directory prepares for future app-level data, templates, secrets, and other files.

### Implementation

- Rename `ApplicationOptions.config_dir` to `base_dir` with default `"."`.
- Rename CLI argument `--config-dir` to `--base-dir`.
- Update path construction in `application.ts`: `join(base_dir, "config.toml")` for app config, `join(base_dir, runtime.id, "config.toml")` for component config.
- Update `ParsedArgs.config_dir` to `base_dir`.
- Update `args.spec.ts` for the renamed CLI argument.

### Spec updates

- Update s0008 to reflect the new directory layout and naming.
- Update s0009 to reflect the renamed CLI argument.

## Out of Scope

- Per-component data, template, or secret directories (future work).
- App-level data, template, or secret directories (future work).
- Changes to the config loader itself (`loadTomlConfig` is path-agnostic).

## Notes

- The config loader takes explicit file paths and does not change.
- Application tests do not exercise config file loading with real files, so no test changes beyond `args.spec.ts`.
