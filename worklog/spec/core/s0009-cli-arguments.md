+++
id = "s0009"
title = "CLI Arguments"
tags = ["cli", "application"]
paths = ["packages/stelaro/src/cli/**"]
+++

## Types

```typescript
type ParsedArgs = {
    readonly base_dir: string | undefined;
    readonly env: string | null;
};

function parseArgs(argv?: string[]): ParsedArgs;
```

## Behavior

- `parseArgs(argv?)` parses and validates core's fixed CLI arguments. `argv`
  defaults to `process.argv.slice(2)`.
- Unknown options and positional arguments are rejected.
- `base_dir` is resolved to an absolute path when supplied and is `undefined`
  otherwise. `env` is the supplied string or `null`.
- `parseArgs` is independent of application creation. A CLI entrypoint may
  pass its result as application options:
  `createApplication(definition, parseArgs())`.
- `createApplication` neither parses nor exposes CLI arguments.

| Argument | Type | Default | Purpose |
| --- | --- | --- | --- |
| `--base-dir` | string | `undefined` | Override the base directory. |
| `--env` | string | `null` | Select the active environment. |

## Constraints

- Applications MUST NOT declare custom CLI argument schemas.
- Parsing belongs to core and MUST NOT depend on gateway runtimes.

## Anticipated Changes

- The parser may be replaced. Additional core arguments, help text, and
  environment-variable fallbacks may be specified later.
