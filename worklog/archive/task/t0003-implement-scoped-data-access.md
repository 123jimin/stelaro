+++
id = "t0003"
title = "Implement scoped data access"
status = "done"
tags = ["data", "fs", "context"]
modifies = ["s0011"]
+++

# Implement scoped data access

Implement the `DataAccess` contract in s0011 using Fluent Filesystem from s0010 and t0001.
Create `createDataAccess` to construct a `DataAccess` accessor from a supplied directory.
Add the factory's signature and behavior to s0011.
Build each accessor around one private `FluentPath` rooted at the supplied data directory.
Use `root.confine(subpath)` for every operation, returning `.path` for `resolve` and delegating to the confined path's readers and writers.
Expose `dir` and `resolve` results as strings.
Wire application and component roots in t0010.

## Completion criteria

- Verify absolute directories and confinement for parent traversal, rooted segments, and mixed separators.
- Verify that calling `createDataAccess`, accessing `dir`, and resolving a path require no filesystem access or directory creation.
- Verify that reads and writes target the confined path and retain the Fluent FS behavior.
- Document `createDataAccess`, `DataAccess`, and the inherited symlink limitation under s0004.

## Verification

- TypeScript and ESLint passed using the installed tools. Corepack could not resolve the registry hostname to download the pinned pnpm version.
- The compiled Node.js suite passed on Windows with 22 passing tests and three existing filesystem skips. All 25 tests passed on Linux.
- The tests cover confinement, construction and resolution with access to the data directory denied, and reads and writes that leave a sibling file untouched.
