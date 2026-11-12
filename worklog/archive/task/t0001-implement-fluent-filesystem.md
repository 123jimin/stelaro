+++
id = "t0001"
title = "Implement Fluent Filesystem"
status = "done"
tags = ["fs"]
modifies = ["s0010", "s0012"]
+++

# Implement Fluent Filesystem

Implement s0010 in `packages/stelaro/src/fs/` and expose its API from `@jiminp/stelaro`.
Set up the pnpm workspace and core package with the build, lint, and test tooling needed for this module.
Follow s0002 for package boundaries, s0003 for dependency selection, and s0004 for public JSDoc.

## Scope

- Implement `fluentPath`, `join`, and `confine` as immutable absolute path operations that perform no I/O.
  Implement `confine` against Node's filesystem path semantics, including the separator, root reset, and parent traversal rules in s0010.
  Document the symlink limitation.
- Implement required and optional reads for UTF-8 text, `Buffer`, JSON, and TOML.
  Check for a regular file and read through the same handle, prevent blocking on FIFOs, and close the handle on every exit path.
  Both optional entry points return `null` only for `ENOENT`, `ENOTDIR`, or `ENAMETOOLONG`.
  JSON and TOML schema overloads call `assert` and infer the return type from `schema.infer`.
- Implement writers for all four formats, including parent directory creation and overwriting existing files.
- Implement the shared `StelaroError` base from s0012 in `packages/stelaro/src/error.ts` and use it for `NotRegularFileError` with its readonly `file_path`.
  Keep the filesystem module independent of component, application, and configuration code.

## Completion criteria

- Verify absolute and immutable paths, `join` traversal, and `confine` containment under Windows and POSIX path interpretation.
  Cover mixed separators, rooted segments, and surplus parent traversal.
- Verify reads and writes for all four formats, parent creation, overwriting, schema inference, and propagation of parsing and validation failures.
  Verify required and optional missing-path behavior, permission errors, symlinks to regular files, rejection of directories, and prompt rejection of FIFOs on a platform that supports them.
- Run `pnpm build`, `pnpm lint`, and `pnpm test`.
  Record verified implementation status in s0010 and for the shared error contract in s0012.

## Verification

- `pnpm build`, `pnpm lint`, and `pnpm test` passed on Windows.
  Eight tests passed and three skipped because POSIX special files or file symlink privileges were unavailable.
- All eleven tests passed on Linux, including symlinks, FIFOs, Unix sockets, and character devices.
