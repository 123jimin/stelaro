+++
id = "t0015"
title = "Write public documentation and configure TypeDoc"
status = "done"
tags = ["documentation", "tooling"]
modifies = ["s0004"]
blocked_by = ["t0010", "t0013"]
+++

# Write public documentation and configure TypeDoc (NEEDS APPROVAL)

Update the README for `@jiminp/stelaro` and `@jiminp/stelaro-pino`.
Provide a runnable core quick start and an example using a caller-configured Pino logger.
Configure TypeDoc for both public entry points, following s0004 and the previous iteration's s0018.

## Completion criteria

- Verify that the examples work through the public entry points and that the README describes the two packages and current development commands.
- `pnpm build-docs` generates categorized API documentation for both packages under `docs/`, including `.nojekyll`.
  Keep generated docs out of Git.
- Verify the build against the exports available when this task lands.
  Each API task supplies its own public JSDoc. Verify coverage of the completed API in t0017.

## Verification

- Compiled and ran both README examples through the package entry points.
- TypeDoc 0.28.20 generated both categorized package references and `.nojekyll` without warnings, using manifest-derived entry points.
- The offline verification copy used cached transitive versions where the network-restricted environment could not fetch the versions in the repository lockfile.
