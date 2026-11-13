+++
id = "t0008"
title = "Implement configuration and secrets loading"
status = "done"
tags = ["config", "fs", "errors"]
modifies = ["s0009"]
blocked_by = ["t0002", "t0006"]
+++

# Implement configuration and secrets loading

Implement the configuration and secrets loader from s0009 using the directory contract from t0002 and Fluent FS from s0010.
Return validated values for the runtime to install during startup and for configuration reload to stage before a swap.
Keep the loader independent of lifecycle transitions.

## Base configuration

A component with a configuration schema requires a base file. Its absence raises `ConfigFileError` as specified in s0009.

## Completion criteria

- Verify that undeclared config and secrets are skipped, missing overlays are ignored, overlays win on conflict through recursive merge, and schema defaults apply.
- Verify that missing secrets produce a warning and validate an empty object.
- Verify that file and schema failures are surfaced as the appropriate config or secrets errors.
- Document any public helpers and errors under s0004.

## Verification

- TypeScript and ESLint passed using the installed tools. The pinned pnpm version was unavailable in the local Corepack cache.
- The compiled suite passed on Windows with 51 passing tests and three existing filesystem skips.
- Loader tests cover required base configuration, missing secrets warnings, omitted schemas, missing overlays, defaults, TOML merge behavior, and structured failures with original causes.
