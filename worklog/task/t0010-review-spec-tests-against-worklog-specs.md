+++
id = "t0010"
title = "Review spec tests against worklog specs"
tags = ["test"]
status = "active"
modifies = ["s0003", "s0014", "s0016", "s0017", "s0028", "s0032", "s0008", "s0022", "s0027"]
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

State: every test file reviewed and edited. `pnpm build`, `pnpm lint` pass; `pnpm test` has 1 failing test on purpose.

Divergence (failing test): s0003 `mergeComponentCalls` throws `DuplicateCallError` for call names inherited from `Object.prototype` (`toString`, `constructor`), because `component.ts` checks with `in` (`component.spec.ts`).

Specified but unimplemented, unmarked: none found.

### Resolved by the human

The human permitted spec edits for these items, to be reviewed before commit, and implementation changes for s0016 and s0027.

- s0003: `EmptyInput` accepts only plain objects without own enumerable keys (spec relaxed; TSDoc aligned).
- s0016: `base` and call paths must be normalized: non-empty segments of URL-unreserved characters, none `.` or `..`. Otherwise `createExposeCallsFactory` throws `RangeError` for `base`, and `exposeCalls` throws `InvalidCallEndpointError` for a call path (spec, `index.ts`, tests). The rule also excludes Fastify route syntax (`:`, `*`) and `%`, which Fastify registers literally but matches decoded.
- s0017, s0014: the Discord token sits in secrets (spec amended). s0017 now cites s0032 and says a call over the concurrency limit waits.
- s0020: the timeout range needs no spec text. A worker-thread test covers the no-signal environment.
- s0028: references corrected to s0002, s0008, and s0020.
- s0032 (new) specifies the rate and concurrency limiters, with tests.
- `topologicalSort` stays unspecified (not exported from the package); its TSDoc now states the duplicate and cycle errors, and `topological-sort.spec.ts` tests that contract.
- s0022 `confine`: the spec now says the guarantee holds under Node's `\\?\` prefixing on Windows, and Dangers names Bun. Before this, Node 24 on Windows 11 showed no escape: reserved device names, trailing dots and spaces, and short names were ordinary files, `name:stream` stayed in the named file, and `..::$INDEX_ALLOCATION` failed. A test checks that device names and a stream suffix stay files inside the base; it is meaningful only on Windows.
- s0027 `IntlShape` cache: catalog locales match case-insensitively, a catalog under a malformed tag is ignored, and every tag without a catalog shares one source-only shape, so shapes are bounded by the catalogs. `Intl.getCanonicalLocales` costs about 3 µs, as much as a translation (about 3.5 µs), so tags are matched by folding ASCII case instead. `toLowerCase` would map `"\u212Ao"` to `ko`. Aliases such as `iw`/`he` stay distinct. A bounded set (256) of seen fallback tags skips the well-formedness check on repeats, so a malformed tag is reported at least on its first use after each `load`. Measured: unchanged `t` latency, no heap growth over 200,000 distinct tags. No test can observe the shape bound without spying on FormatJS.
- s0008: a component with a configuration schema requires its base file, even with an overlay; a missing one is a `ConfigFileError`. File failures, like validation failures, fail startup or keep old values on reload. Tests added for a missing file at startup, with an overlay, and on reload.

### Open

- s0022 `FileWriter.json` (suggestion = current code): reject with `TypeError` and touch nothing, no directory or file, when `JSON.stringify` returns `undefined` (top-level `undefined`, function, symbol) or throws (`BigInt`, cycles). Nested values follow `JSON.stringify`.
- s0027 (suggestions):
  - Repeated `load` replaces earlier loaded catalogs with the seed overlaid by this load's catalogs, all at once on success; `t` uses the previous catalogs until then. The logger is replaced, falling back to the console. This matches the code.
  - A reader rejection rejects `load` and changes nothing. This matches the code. A non-object catalog or a non-string message should reject `load` with `TypeError`; the code does not check it.
  - A malformed `default_locale` throws `RangeError` (as now). Malformed `locales` entries and seed keys are now ignored; throwing `RangeError` would surface the mistake. In `t`, a malformed tag is reported and gets source text formatted in `default_locale` (as now).
  - A missing interpolation value returns the selected message's unformatted pattern, which is what the code does, reported once (the code reports twice).
- s0017 (not addressed): malformed patterns, duplicate commands, cleanup after a failed login, dispatch by command type. The Lifecycle bullet lists login before registration, but the code registers commands, attaches listeners, then logs in.
