+++
id = "t0008"
title = "Implement configuration and secrets loading"
status = "pending"
tags = ["config", "fs", "errors"]
modifies = ["s0009"]
blocked_by = ["t0002", "t0006"]
+++

# Implement configuration and secrets loading

Implement the configuration and secrets loader from s0009 using the directory contract from t0002 and Fluent FS from s0010.
Return validated values for the runtime to install during startup and for configuration reload to stage before a swap.
Keep the loader independent of lifecycle transitions.

## Open spec decision

Specify the behavior for a missing base configuration file when the component declares a configuration schema.

## Completion criteria

- Verify that undeclared config and secrets are skipped, missing overlays are ignored, overlays win on conflict through recursive merge, and schema defaults apply.
- Verify that missing secrets produce a warning and validate an empty object.
- Verify that file and schema failures are surfaced as the appropriate config or secrets errors.
- Document any public helpers and errors under s0004.
