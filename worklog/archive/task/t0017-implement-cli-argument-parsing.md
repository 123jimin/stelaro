+++
id = "t0017"
title = "Implement CLI argument parsing"
status = "done"
tags = ["cli", "application"]
modifies = ["s0002", "s0009"]
+++

## Scope

- Implement parsing and validation of Peranto's fixed CLI arguments during application creation.
- Expose parsed CLI arguments on the application runtime.
- Ensure CLI argument parsing completes before config loading.
- Update affected specs with approved behavior, leaving `UNIMPLEMENTED` markers where related behavior remains out of scope.

## Out of Scope

- Custom application-defined CLI argument schemas.
- Subcommand parsing.
- Help text generation.
- Environment variable fallbacks.
- Gateway-specific CLI arguments.

## Initial Argument Set

The first fixed argument, consumed by t0008 (config loading) when it lands:

| Argument | Type | Default | Purpose |
|----------|------|---------|---------|
| `--config-dir` | string | `undefined` | Override config directory path |

## Implementation Plan

### 1. Spec update (s0009) — needs approval

Add `--config-dir` as the first enumerated argument in s0009 behavior section. The spec currently says "Peranto defines a fixed set of CLI arguments" without listing any.

### 2. Internal parser boundary — `src/cli/args.ts`

Wraps `node:util` `parseArgs` behind a stable internal interface (per d0001).

- `ParsedArgs` type — readonly object with one field per fixed argument.
- `parseArgs(argv?: string[])` — parses the argument array. Defaults to `process.argv.slice(2)` when omitted. Returns `ParsedArgs`. Throws on unknown arguments.
- The `argv` parameter exists for testability. Production code omits it.
- `node:util` types and behavior must not leak beyond this module.

### 3. Tests — `src/cli/args.spec.ts`

Derived from spec, not implementation:

- Parses `--config-dir <path>` into `config_dir`.
- Returns `undefined` for `config_dir` when omitted.
- Throws on unknown arguments (e.g. `--bogus`).
- Handles `--config-dir=<path>` (equals syntax).

### 4. Integration with `createApplication`

`createApplication` currently accepts one parameter: `ApplicationDefinition<TComponents>`.

Add an optional second parameter for runtime options:

```
createApplication(definition, options?)
```

Where options includes:

- `argv?: string[]` — override for `process.argv` (testability). When omitted, `parseArgs()` uses `process.argv.slice(2)`.

`createApplication` calls `parseArgs` during construction and stores the result. Parsing happens before any future config loading (ordering guarantee for t0008).

Existing call sites (`createApplication(definition)`) remain unchanged — the second parameter is optional.

### 5. Expose on application runtime

Add `args: ParsedArgs` to the `Application` return type. Readonly, set once during creation.

```
const app = createApplication(definition);
app.args.config_dir  // string | undefined
```

### 6. Exports

- `src/cli/index.ts` — re-export `ParsedArgs` type (public) and `parseArgs` (internal, not re-exported from package root).
- `src/index.ts` — re-export from `./cli/index.ts` (types only; `parseArgs` stays internal).

### 7. Spec updates post-implementation

- s0009: remove `UNIMPLEMENTED` markers for implemented behavior, add `--config-dir` to enumerated arguments.
- s0002: note that `createApplication` accepts optional runtime options.

## Sequence

1. Write tests (step 3).
2. Implement parser boundary (step 2).
3. Green tests.
4. Integrate into `createApplication` (steps 4–5).
5. Add integration tests for `createApplication` with `argv` override.
6. Update exports (step 6).
7. Update specs (steps 1, 7).
