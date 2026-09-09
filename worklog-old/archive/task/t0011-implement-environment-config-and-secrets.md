+++
id = "t0011"
title = "Implement environment config and secrets"
status = "done"
tags = ["config", "cli", "application"]
modifies = ["s0008", "s0009", "s0019"]
blocked_by = []
+++

## Scope

- Add `--env` CLI argument to specify the active environment.
- Implement environment-specific config overlays (`config.{env}.toml`) that deep-merge onto base `config.toml`.
- Implement secrets loading (`secrets.toml`) with the same schema-validated pattern as config.
- Implement environment-specific secrets overlays (`secrets.{env}.toml`) that deep-merge onto base `secrets.toml`.
- Expose validated secrets through `context.secrets`, typed from a declared secrets schema.
- Apply the same patterns at both application and component levels.
- Update specs s0008, s0009, and s0019 with approved behavior and remove corresponding `UNIMPLEMENTED` markers.

## Out of Scope

- Secrets encryption or vault integration.
- Config/secrets file watching for automatic reload.
- Base directory initialization (creating empty files).
- Data directory and templates.

## Dependencies

- Depends on `t0008` (validated configuration) — already done.
- Depends on `t0017` (CLI argument parsing) — already done.
