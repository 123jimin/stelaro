+++
id = "t0002"
title = "Implement startup options and directories"
status = "pending"
tags = ["application", "cli", "fs"]
modifies = ["s0007", "s0008"]
+++

# Implement startup options and directories

Implement the startup options and directory contract in s0007 and s0008.
Expose `ApplicationOptions`, `ParsedArgs`, `parseArgs`, `DEFAULT_APPLICATION_DIRS`, and `componentFilePath` as specified.
Keep the parser independent of application creation and leave runtime wiring to t0010.
Add public JSDoc under s0004.

## Completion criteria

- The parser accepts the five fixed flags, preserves supplied strings, returns `null` for omitted values, and rejects unknown flags and positional arguments.
- Directory resolution uses the working directory and configured base as specified. Verify defaults and relative and absolute overrides on Windows and Linux.
- Verify base and environment-overlay TOML paths and that managed paths stay within their configured directory.
  Resolve any underspecified environment selector handling in s0008 before choosing public validation rules.
- Leave the optional layout initialization deferred.
