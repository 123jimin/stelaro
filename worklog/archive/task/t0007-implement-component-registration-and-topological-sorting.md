+++
id = "t0007"
title = "Implement component registration and topological sorting"
status = "done"
tags = ["component", "application", "architecture"]
modifies = ["s0006"]
blocked_by = ["t0006"]
+++

# Implement component registration and topological sorting

Build the component registry and dependency validation from s0006.
Use a shared topological sorting implementation for registration and `sortComponentsByUses`.

## Completion criteria

- Verify that registration orders dependencies before their consumers, accepts a declared subset of a registered call surface, and rejects missing dependencies and calls absent from the registered surface.
- Verify structured errors for duplicate component IDs, duplicate calls, missing handlers, and dependency cycles under s0012.
- Verify that the public sort helper ignores dependencies outside its input list and still rejects duplicate IDs and cycles.
- Document the sort helper and public errors under s0004.

## Verification

- TypeScript and ESLint passed using the installed tools. The pinned pnpm version was unavailable in the local Corepack cache.
- The compiled suite passed on Windows with 44 passing tests and three existing filesystem skips.
- Registration tests cover merged subsets, missing dependencies and calls, same-name references from separate declarations, duplicate IDs and calls, missing handlers, and dependency cycles.
- The sorter and registry both returned dependency-first order for a 25,000-component chain.
