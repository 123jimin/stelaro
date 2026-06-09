+++
id = "t0043"
title = "Confine data-access subpaths (resolve/read/write) instead of bare join"
status = "done"
tags = ["data", "fs", "security"]
modifies = ["s0021"]
blocked_by = []
+++

## Context

`createDataAccess` (`packages/stelaro/src/data/data.ts`) resolves subpaths with `FluentPath.join`,
which honors `..` and lets a subpath escape the data dir — e.g.
`context.data.read("../../other-component/data/secret")` reads outside `{component_id}/data`.
s0021 currently *disclaims* containment:

- Path Resolution: "`resolve` uses `path.join`…"
- Constraints: "the data access API does not enforce containment (path traversal prevention is not a
  goal at this layer)."

`FluentPath.confine` (s0022) already exists and was verified (2026-06-09) to confine on Linux
(provably: emitted parts never contain a traversal token) and Windows (empirically — 20k-case fuzz
plus targeted fs probes; under `node:fs`/libuv `..` is the only honored traversal and `confine`
strips it, trailing dot/space are not trimmed to `..`, and device names are neutralized). DataAccess
consumes paths only through s0022 `FileReader`/`FileWriter` (i.e. `node:fs`) — exactly the
consumption model `confine` is safe for. Decision (user, 2026-06-09): enforce containment at the
data-access layer by switching `resolve`/`read`/`write` from `join` to `confine`.

## Scope

- Core: `createDataAccess` — `resolve`, `read`, and `write` resolve via `fp.confine(subpath)` instead
  of `fp.join(subpath)`. `dir` is unchanged.
- s0021 amendments (behavioral — approved):
  - Component-Level & Application-Level: `resolve(subpath)` *confines* the subpath within the data
    dir (caps `..` at the dir; absolute / drive-prefixed segments reset to the dir) rather than
    "joins the subpath onto" it. `read`/`write` target the confined path.
  - Path Resolution: replace "`resolve` uses `path.join`" with confinement semantics (delegates to
    s0022 `confine`; `..` cannot escape `dir`; absolute segments reset to `dir`). Keep "Neither `dir`
    nor `resolve` check whether the path exists on disk."
  - Constraints: replace the no-containment constraint with: data-access subpaths are confined to the
    data dir; `..` cannot traverse above it. Note the boundary: paths are not realpath-resolved, so
    symlink/junction escape is out of scope (hard/soft links assumed absent). Mirror s0022's
    `node:fs`-backend scope caveat in s0021's Dangers.
- Decision record: d0006 captures the reversal of s0021's prior "path traversal prevention is not a
  goal at this layer" stance (context -> choice -> rationale -> consequences),
  `relates_to = ["s0021"]`. Reversing an explicit documented stance warrants a decision.
- Tests derive from spec: `resolve`/`read`/`write` with `..`, leading `/`, and mixed segments stay
  within `dir`. The existing `data.spec.ts` "resolves subpaths relative to dir" assertion stays valid
  (no traversal token, so `confine` == `join` there). Add adversarial cases: `../..`, leading `/abs`,
  `a/../../b`, Windows `..\\..`, drive-relative.

## Out of scope

- Changing `confine` itself — verified correct for `node:fs` consumption. Hardening `confine` so its
  *output string* is robust even for non-`node:fs` consumers (trimming trailing dots/spaces a raw
  Win32 API or child process would canonicalize back into `..`) is a separate concern; spin a
  follow-up if wanted. DataAccess never shells out, so it is unaffected.
- s0019 base-dir layout and the `context.data` / `app.data` wiring (already in place via t0028).

## Notes

- Behavioral diff is specifically `..` capping. Absolute-segment and `.` handling already coincide
  between `join` and `confine` (`path.join(dir, "/x")` and `confine("/x")` both yield `{dir}/x`); only
  `..` differs (`join` escapes, `confine` caps).
- Cross-ref prior art: t0028 (implemented data access), t0029 (read/write helpers).
- Verify s0022 already documents `confine`'s reset-on-absolute and `..`-capping so s0021 can delegate
  to it cleanly rather than restating the algorithm.
