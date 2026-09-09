+++
id = "d0006"
title = "Data access confines subpaths, reversing s0021's no-containment stance"
relates_to = ["s0021"]
supersedes = []
+++

## Context

s0021 originally declared that path-traversal prevention "is not a goal at this layer" and resolved
subpaths with `path.join`, so `context.data.read("../../x")` could escape a component's data
directory into a sibling component's data — or anywhere above the base. The `confine` primitive
(s0022) was verified (2026-06-09) to confine reliably under the `node:fs` backend on both Linux
(provably — emitted parts never contain a traversal token) and Windows (20k-case fuzz + fs probes);
the consumer simply was not using it.

## Choice

`DataAccess.resolve`/`read`/`write` resolve subpaths with `confine` instead of `join`, confining all
data-access I/O to the data directory. s0021's no-containment constraint is reversed to a containment
guarantee.

## Rationale

- Per-component data directories are an isolation boundary; silent traversal across them is a footgun
  for component authors who pass user-influenced subpaths.
- The safe primitive already existed and was verified — adopting it is lower risk than leaving the
  escape hatch open, and costs nothing for the common case (subpaths without `..`).
- A `node:fs`-scoped guarantee suffices for the current backend; the scoping caveat and the deferred
  backend-independent hardening are recorded in s0022's Dangers and t0044.

## Consequences

- `context.data` / `app.data` subpaths can no longer escape the data directory: `..` is capped and
  absolute segments reset to the directory. Any caller relying on escape would break (none in-repo).
- Containment is string/normalization-based, not realpath-based; symlink/junction escape remains out
  of scope (hard/soft links assumed absent).
- If s0022's I/O backend is abstracted away from `node:fs` (an anticipated change), `confine`
  robustness must be revisited (see s0022 Dangers, t0044).
