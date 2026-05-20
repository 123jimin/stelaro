+++
id = "d0001"
title = "Use node:util parseArgs as initial CLI parser"
relates_to = ["s0009"]
supersedes = []
+++

## Context

Stelaro needs CLI argument parsing for a fixed set of core arguments. The set is small and non-customizable by application authors.

## Choice

Use `node:util` `parseArgs` as the initial CLI parser. Keep the parsing behind an internal boundary so the parser can be swapped to a third-party library later without affecting public API.

## Rationale

- Zero additional dependencies for an intentionally small argument surface.
- `parseArgs` is stable and available since Node 18.3.
- A third-party library would add dependency weight with no immediate benefit for a fixed argument set.
- The known future swap means the implementation must not leak `parseArgs`-specific types or behavior beyond the internal boundary.

## Consequences

- CLI parsing internals must be isolated behind a module boundary that the rest of core consumes through a stable internal interface.
- When a third-party parser is adopted, only the internal module changes — no public API impact.
- Until the swap, features beyond what `parseArgs` provides (subcommands, rich help text) are not available.
