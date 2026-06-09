+++
id = "t0044"
title = "Make s0022 confine a binding adversarial containment guarantee (node:fs-scoped)"
status = "done"
tags = ["util", "fs", "security"]
modifies = ["s0022"]
blocked_by = []
+++

## Context

s0022 describes `confine` (s0022:66 — "`..` cannot escape above the original path; absolute segments
reset to the original path") only as *descriptive* behavior. There is no binding guarantee that
confinement holds against **adversarial** input, no Constraint/Danger treating it as a containment
boundary, and the current `path.spec.ts` tests are benign string-equality checks that never exercise
hostile inputs.

`confine` was verified (2026-06-09, this session) to confine on Linux (provably — emitted parts never
contain a traversal token) and Windows (empirically — 20k-case fuzz + fs probes). The Windows safety
is *borrowed from* the `node:fs`/libuv consumption model: libuv normalizes `.`/`..` itself and hands
NT a namespaced path, so the only honored traversal is literal `..` (which `confine` strips), trailing
dot/space are not trimmed into `..`, and device names are neutralized. The returned string itself is
not intrinsically robust for a raw-Win32 consumer.

Decision (user, 2026-06-09): make the confinement guarantee **binding and explicit** in s0022,
**scoped to the current `node:fs` backend**. No implementation change — `confine` is already correct
under `node:fs`. Backend-independent hardening was considered and deferred (see Out of scope).

## Scope

- s0022 amendments (spec emphasis — no code behavior change):
  - `confine` bullet: strengthen from descriptive to **binding** — `confine` keeps the resolved path
    within the base for *all* inputs, including adversarial ones: nested/over-popping `..`
    (`../../..` is a no-op past the base), mixed `/` and `\` separators, leading-absolute and
    drive-prefixed segments (`/etc`, `C:\…`, `C:rel`), and empty/`.` noise.
  - Add a **Constraint**: `confine` is a containment boundary — for any segments,
    `confine(...segments).path` is the base or a descendant of it (as resolved by the `node:fs`
    backend). Contrast `join`, which explicitly permits escape.
  - Add a **Danger**: the guarantee is established for the `node:fs`/libuv consumption model. A future
    non-`node:fs` backend (see Anticipated Changes — backend abstraction, s0022:104) applying raw OS
    path canonicalization could reinterpret an otherwise-inert returned component (e.g. a Windows
    trailing dot/space collapsing into `..`); confine robustness must be revisited when the backend is
    abstracted.
- Tests derive from spec: add adversarial confinement tests to `path.spec.ts`. Assert
  `confine(...).path === base || path.startsWith(base + sep)` for: `../..`, `a/../../b`, leading
  `/abs`, Windows `..\\..`, drive-relative `C:rel`, mixed separators, trailing dot/space components,
  and many-segment `..` over-pop. Keep the existing benign cases.

## Out of scope

- Implementation changes to `confine` (`path.ts`) — none; verified correct for `node:fs`.
- Backend-independent hardening (neutralizing Windows trailing-dot/space in the returned string so it
  is safe for *any* consumer, not just `node:fs`). Deferred per the node:fs-scoped decision; revisit
  alongside the s0022:104 backend abstraction. Note the tension: such hardening trades exotic-POSIX
  filename fidelity (`.. `, `...`, trailing-dot/space names) for cross-backend safety.
- s0021 / DataAccess switch to `confine` — t0043.

## Notes

- Pairs with t0043 (DataAccess consumes `confine`). Neither hard-blocks the other, but t0044's
  adversarial tests harden the primitive t0043 leans on.
- Rationale for the node:fs scoping is recorded here; promote to a decision record if the backend
  abstraction (s0022:104) is later taken up and the scope is revisited.
