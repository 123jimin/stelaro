+++
id = "s0007"
title = "Startup Options"
tags = ["application", "cli", "config"]
paths = ["packages/stelaro/src/application/application.ts", "packages/stelaro/src/cli/**"]
+++

# Startup Options

## Types

```typescript
type ApplicationOptions<TEnv extends string = string> = {
    readonly base_dir?: string | null;
    readonly config_dir?: string | null;
    readonly secrets_dir?: string | null;
    readonly data_dir?: string | null;
    readonly env?: TEnv | null;
};

type ParsedArgs<TEnv extends string = string> = {
    readonly base_dir: string | null;
    readonly config_dir: string | null;
    readonly secrets_dir: string | null;
    readonly data_dir: string | null;
    readonly env: TEnv | null;
};

function parseArgs(argv?: string[]): ParsedArgs<string>;
```

## Behavior

- `parseArgs(argv?)` parses the fixed core flags.
  - Its default input is `process.argv.slice(2)`.
  - It rejects unknown flags and positional arguments.
- Each parsed value is the supplied string or `null`.
  - Callers can narrow `env` to a union of environment names by validating the parsed value.
  - The parser preserves supplied directory strings.
  - The application resolves them as specified in s0008.
- The parser is independent of application creation.

| Option | CLI flag | CLI default | Purpose |
| --- | --- | --- | --- |
| `base_dir` | `--base-dir` | `null` | Override the base directory. |
| `config_dir` | `--config-dir` | `null` | Override the configuration directory. |
| `secrets_dir` | `--secrets-dir` | `null` | Override the secrets directory. |
| `data_dir` | `--data-dir` | `null` | Override the data directory. |
| `env` | `--env` | `null` | Select the active environment. |

### Application integration

- An entry point can pass the parser result as options with `createApplication(definition, parseArgs())`.
- `createApplication` neither parses nor exposes CLI arguments.
- The selected environment controls configuration and secrets overlays (s0009).

## Constraints

- Applications MUST NOT declare custom CLI argument schemas.
- Parsing belongs to core and MUST NOT depend on gateway runtimes.

## Anticipated changes

- The parser may be replaced. Additional core arguments, help text, and environment-variable fallbacks may be specified later.
