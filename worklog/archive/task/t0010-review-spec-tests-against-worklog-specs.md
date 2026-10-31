+++
id = "t0010"
title = "Review spec tests against worklog specs"
tags = ["test"]
status = "done"
modifies = ["s0003", "s0014", "s0016", "s0017", "s0028", "s0032", "s0008", "s0022", "s0027", "s0002", "s0020", "s0030"]
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

Divergence (failing test, follow-up t0011): s0003 `mergeComponentCalls` throws `DuplicateCallError` for call names inherited from `Object.prototype` (`toString`, `constructor`), because `component.ts` checks with `in` (`component.spec.ts`).

Specified but unimplemented, unmarked: none found.

### Resolved by the human

The human permitted spec edits for these items, to be reviewed before commit, and implementation changes for s0016, s0017, and s0027.

- s0003: `EmptyInput` accepts only plain objects without own enumerable keys (spec relaxed; TSDoc aligned).
- s0016: `base` and call paths must be normalized: non-empty segments of URL-unreserved characters, none `.` or `..`. Otherwise `createExposeCallsFactory` throws `RangeError` for `base`, and `exposeCalls` throws `InvalidCallEndpointError` for a call path (spec, `index.ts`, tests). The rule also excludes Fastify route syntax (`:`, `*`) and `%`, which Fastify registers literally but matches decoded.
- s0017, s0014: the Discord token sits in secrets (spec amended). s0017 now cites s0032 and says a call over the concurrency limit waits.
- s0020: the timeout range needs no spec text. A worker-thread test covers the no-signal environment.
- s0028: references corrected to s0002, s0008, and s0020.
- s0032 (new) specifies the rate and concurrency limiters, with tests.
- `topologicalSort` stays unspecified (not exported from the package); its TSDoc now states the duplicate and cycle errors, and `topological-sort.spec.ts` tests that contract.
- s0022 `confine`: the spec now says the guarantee holds under Node's `\\?\` prefixing on Windows, and Dangers names Bun. Before this, Node 24 on Windows 11 showed no escape: reserved device names, trailing dots and spaces, and short names were ordinary files, `name:stream` stayed in the named file, and `..::$INDEX_ALLOCATION` failed. A test checks that device names and a stream suffix stay files inside the base; it is meaningful only on Windows.
- s0027 `IntlShape` cache: catalog locales match case-insensitively, and every tag without a catalog shares one source-only shape, so shapes are bounded by the catalogs. `Intl.getCanonicalLocales` costs about 3 µs, as much as a translation (about 3.5 µs), so tags are matched by folding ASCII case instead. `toLowerCase` would map `"\u212Ao"` to `ko`. Aliases such as `iw`/`he` stay distinct. Shapes are built when catalogs change, so `t` is one map lookup; malformed request tags get the fallback without a report (spec relaxed). Measured: unchanged `t` latency, no heap growth over 200,000 distinct tags. No test can observe the shape bound without spying on FormatJS.
- s0027 gaps: `createI18n` throws `RangeError` for a malformed `default_locale`, `locales` entry, or `messages` key. `load` replaces catalogs and logger only after every read succeeds (the last overlapping load to finish wins); a rejecting reader rejects with its error, and a catalog that is not a plain object of strings rejects with `TypeError`. A failing translation whose source also fails returns the translation's unformatted pattern. Each `t` call reports at most one formatting failure (FormatJS reported two), also when the logger calls `t`, and a throwing logger never makes `t` throw. Spec, code, tests.
- s0022 `FileWriter.json`: specified as the code behaves (`TypeError` without text, `JSON.stringify`'s own error when it throws; nothing created or changed; nested values as `JSON.stringify`), with tests.
- s0008: a component with a configuration schema requires its base file, even with an overlay; a missing one is a `ConfigFileError`. File failures, like validation failures, fail startup or keep old values on reload. Tests added for a missing file at startup, with an overlay, and on reload.
- s0017 gaps: commands are keyed by type and name, and duplicates throw `RangeError` at definition; a command interaction dispatches by its type and name, autocomplete to the chat-input command, and an unmatched one is ignored. Custom-id patterns (colon segments, `{name}` parameters) throw `RangeError` at definition when malformed; overlapping patterns are allowed and the first in definition order wins. The `start` hook registers commands, attaches listeners, then logs in; if login fails, it removes its listeners and fails with the login error. Code: plain `Error` became `RangeError`, and a `{__proto__}` parameter is kept. Spec, code, tests.
- Lifecycle terms: s0002 now defines `start()`/`stop()` (application methods) versus the `start`/`stop` hooks (component steps); s0002, s0003, s0008, s0016, s0017, s0020, and s0027 use them instead of a bare "start" or "stop".
- Empty message key: s0030 requires a non-empty key. `catalogKey`, and so `t` and `bind(...).t`, throws `RangeError` for an empty one (FormatJS threw a generic `Error`); `t`, `bind(...).t`, and `defineMessages` reject a literal empty key at the type level. Spec, code, tests.
- Arktype import: stelaro's `AGENTS.md` now requires `import {type} from "arktype"`, and the 19 files that aliased it as `schema` were rewritten.
