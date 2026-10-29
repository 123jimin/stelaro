+++
id = "s0019"
title = "Application Directories"
tags = ["application", "config"]
paths = ["packages/stelaro/src/application/application.ts", "packages/stelaro/src/cli/args.ts"]
+++

## Types

```typescript
const DEFAULT_APPLICATION_DIRS: {
    readonly config_dir: "config";
    readonly secrets_dir: "secrets";
    readonly data_dir: "data";
};

function componentFilePath(dir: string, component_id: string, env: string | null): string;
```

## Behavior

- One application instance keeps its filesystem state in three directories
  under a common base directory:

  | Directory | Option | Argument (s0009) | Default | Contents |
  | --- | --- | --- | --- | --- |
  | base | `base_dir` | `--base-dir` | working directory | The directories below |
  | config | `config_dir` | `--config-dir` | `config` | Component configuration |
  | secrets | `secrets_dir` | `--secrets-dir` | `secrets` | Component secrets |
  | data | `data_dir` | `--data-dir` | `data` | Application and component data |

- A relative base directory resolves against the working directory. Relative
  config, secrets, and data directories, including the defaults, resolve
  against the base directory.
- The config and secrets directories have the same layout:
  - `{component_id}.toml`: a component's base file.
  - `{component_id}.{env}.toml`: its overlay for environment `env`.
- `componentFilePath(dir, component_id, env)` returns the path of the
  component's overlay for `env` in `dir`. When `env` is `null`, it returns the
  path of the base file.
- The data directory holds application data directly and a component's data
  in `{component_id}/`.
- Overlay files contain only environment-specific differences, are deep-merged
  over base files, and win on conflicts. Missing overlays are ignored.
- UNIMPLEMENTED The application can initialize this layout with empty
  component configuration and secrets files.

## Constraints

- Every application-resolved filesystem path MUST be relative to the config,
  secrets, or data directory.
- Specs introducing paths below these directories MUST add them to this
  layout.
- Secrets files MUST NOT be committed to version control.

## Anticipated Changes

- Locale-specific directories may be added beneath the data directory.

## Dangers

- An application data file named like a component id collides with that
  component's data directory.
