+++
id = "s0019"
title = "Base Directory"
tags = ["application", "config"]
paths = ["packages/stelaro/src/application/application.ts", "packages/stelaro/src/cli/args.ts"]
+++

## Behavior

- The base directory is the root of one application instance's filesystem
  state. It defaults to the working directory and may be overridden by
  `ApplicationOptions.base_dir` or `--base-dir`.
- Its layout is:
  - `config.toml` and `secrets.toml`: application configuration and secrets.
  - `config.{env}.toml` and `secrets.{env}.toml`: application overlays.
  - `data/`: application data and templates.
  - `{component_id}/config.toml` and `{component_id}/secrets.toml`: component
    configuration and secrets.
  - `{component_id}/config.{env}.toml` and
    `{component_id}/secrets.{env}.toml`: component overlays.
  - `{component_id}/data/`: component data and templates.
- Overlay files contain only environment-specific differences, are deep-merged
  over base files, and win on conflicts. Missing overlays are ignored.
- UNIMPLEMENTED The application can initialize this layout with empty
  application and component configuration and secrets files.

## Constraints

- Every application-resolved filesystem path MUST be relative to the base
  directory.
- Specs introducing paths below the base directory MUST add them to this
  layout.
- Secrets files MUST NOT be committed to version control.

## Anticipated Changes

- Locale-specific directories may be added beneath `data/`.
