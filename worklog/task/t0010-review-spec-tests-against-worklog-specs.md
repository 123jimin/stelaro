+++
id = "t0010"
title = "Review spec tests against worklog specs"
tags = ["test"]
status = "active"
modifies = []
+++

# Review spec tests against worklog specs

Review every `*.spec.ts` under `packages/` against the specs that govern it, and change the tests so that a defect in the specified behavior fails at least one test.

## Rules

- Tests follow spec behavior, not code. Remove tests that pin implementation details.
- Cover typical valid, typical invalid, and atypical or adversarial inputs for specified behavior.
- A unit test does not re-test a subcomponent that another test already covers; integration tests may.
- The suite stays cheap enough for GitHub CI and a local dev machine.
- No spec or implementation edits. A new test that fails because the code diverges from a spec stays failing and is reported.
- Implement nothing, and write no tests for spec items marked `UNIMPLEMENTED`. Report spec behavior that lacks the marker but has no implementation.

## Outcome

- Edited tests.
- A report of spec/implementation divergences found, and of spec requirements whose correct implementation would be overly complex (candidates for relaxing).

## Completion conditions

- Every spec test file reviewed; `pnpm test` run once afterward and its failures accounted for.
- Human review of the edited tests.

## Findings

State: every test file reviewed and edited; awaiting human review. `pnpm build`, `pnpm lint` pass; `pnpm test` has 1 failing test on purpose; every package runs in under 2 s.

Divergence (failing test): s0003 `mergeComponentCalls` throws `DuplicateCallError` for call names inherited from `Object.prototype` (`toString`, `constructor`), because `component.ts` checks with `in` (`component.spec.ts`).

Specified but unimplemented, unmarked: none found.

Relaxation candidates:

- s0022 `confine` "under `node:fs` resolution": Win32 device names and NTFS stream syntax depend on the Windows version; state lexical containment with a platform caveat.
- s0016 `exposeCalls` "a path not under `${base}/`": a literal prefix check admits `/api/../x`; say whether a prefix check suffices.
- s0003 `EmptyInput` "objects with any keys": non-enumerable own keys pass; say "own enumerable keys".
- s0027 one `IntlShape` per populated locale: the code caches one per requested locale string without bound.

Spec gaps (code behavior with no spec; tests removed or not written):

- s0017: the token sits in secrets though the spec says config; rejecting malformed patterns and duplicate commands; cleanup after a failed login; dispatch by command type; whether the concurrency limit rejects or queues.
- s0008: a missing declared config file.
- s0022: `FileWriter.json` with a value that has no JSON form.
- s0027: repeated `load`, reader rejection, malformed locale tags, output for a missing interpolation value.
- s0028 says s0002 defines lifecycle events and levels; s0002 defines neither.
- s0020: the accepted timeout range; the no-signal environment rule has no test that runs from `dist`.
- The rate and concurrency limiters have no spec; argument validation and FIFO order are TSDoc only.
