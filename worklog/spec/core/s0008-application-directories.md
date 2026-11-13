+++
id = "s0008"
title = "Application Directories"
tags = ["application", "config", "data", "fs"]
paths = ["packages/stelaro/src/application/application.ts", "packages/stelaro/src/application/directories.ts"]
+++

# Application Directories

## Directory contract

### Types

```typescript
const DEFAULT_APPLICATION_DIRS: {
    readonly config_dir: "config";
    readonly secrets_dir: "secrets";
    readonly data_dir: "data";
};

function componentFilePath(dir: string, component_id: string, env: string | null): string;
```

### Resolution

The startup directory resolver uses the options in s0007.

| Directory | Option | Default | Contents |
| --- | --- | --- | --- |
| Base | `base_dir` | Working directory | Base for relative directory paths |
| Configuration | `config_dir` | `config` | Component configuration |
| Secrets | `secrets_dir` | `secrets` | Component secrets |
| Data | `data_dir` | `data` | Application and component data |

- A relative base directory resolves against the working directory.
  - Relative config, secrets, and data directories, including the defaults, resolve against the base directory.
- Paths to files managed by the application MUST resolve relative to the applicable config, secrets, or data directory.

### Layout

- The config and secrets directories each store a component's base file as `{component_id}.toml` and its environment overlay as `{component_id}.{env}.toml`.
  - See s0009 for overlay behavior.
- `componentFilePath(dir, component_id, env)` returns the component's overlay path in `dir`, or its base file path if `env` is `null`.
  - The interpolated name must refer to a single file directly in `dir`.
  - The function throws `InvalidComponentFileNameError` with the generated `file_name` if it contains a `/` or a NUL character, or if it contains a `\` or `:` on Windows.

### Application integration

- Each application instance resolves its configuration, secrets, and data directories using the startup directory resolver.
- Application data lives directly in the data directory.
- Component data lives in its `{component_id}/` subdirectory.
- An application data file named after a component ID collides with that component's directory.
- See s0011 for scoped data access.

## Layout initialization (UNIMPLEMENTED)

The application can initialize this layout with empty component configuration and secrets files.

## Constraints

- Specs introducing paths below these directories MUST add them to this layout.
- Secrets files MUST NOT be committed to version control.

## Anticipated changes

- Locale-specific directories may be added beneath the data directory.
