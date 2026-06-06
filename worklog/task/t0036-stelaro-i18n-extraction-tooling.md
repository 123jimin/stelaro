+++
id = "t0036"
title = "stelaro-i18n: @formatjs/cli message extraction tooling"
status = "cancelled"
tags = ["i18n", "localization", "tooling", "formatjs"]
modifies = ["s0027"]
blocked_by = []
+++

## Cancelled

No implementation is required: a developer runs `@formatjs/cli` against the source as-is. The
extractor matches call expressions by identifier name, and `defineMessages` is a stock-recognized
name; the descriptors are FormatJS-shaped 1:1 (camelCase `defaultMessage`, by design); ids are
explicit, so extraction is an offline pass with no Babel/SWC transform in the `tsc` build. Hence
`pnpm dlx @formatjs/cli extract 'src/**/*.ts' --out-file i18n/en.json` works with zero package
changes — the extraction-compatible `defineMessages` *is* the deliverable, and it shipped in t0035.

What this task contemplated (pinning `@formatjs/cli` as a devDep + convenience `extract`/`compile`
scripts) is optional ergonomics, not a capability gap, so it does not warrant a tracked task. The
spec's `UNIMPLEMENTED` markers (added when splitting this out) were therefore wrong and have been
removed; s0027's pipeline section now documents extraction as a developer-run external step.

## Context

Split out of t0035 (the premise this split rested on turned out wrong — see Cancelled, above). The
`@jiminp/stelaro-i18n` runtime (createI18n / load / t / defineMessages) is implemented and archived.
s0027's "Catalogs + pipeline" describes a Source catalog produced by `@formatjs/cli` extract over
the in-code `defineMessages` declarations — the step that hands translators `{id, defaultMessage}`.
This task assumed that step needed package tooling to exist; it does not.

`defineMessages` is already descriptor-first (`{id, defaultMessage, description?}`) and ids are
explicit, which is the prerequisite the spec calls out: `@formatjs/cli`'s
`--additional-function-names` assumes a `formatMessage(descriptor, …)` shape, and explicit ids mean
no Babel/SWC transform is needed in the tsc build.

## Scope

- Add `@formatjs/cli` as a devDependency — verify the current version at implementation (don't
  presume); confirm compatibility with the installed `@formatjs/intl`.
- Wire an `extract` script that runs `@formatjs/cli` extract over the package's TS source against
  the `defineMessages` declarations (via `--additional-function-names defineMessages`), emitting the
  Source catalog: `Record<MessageId, {defaultMessage, description?}>`.
- Optionally wire a `compile --ast` script (the spec's optional perf step) precompiling a catalog to
  `Record<MessageId, MessageFormatElement[]>` for runtime parse-skipping.
- Confirm extraction reads the `defineMessages` declarations, NOT the locale-first `t(locale, …)`
  calls (whose descriptor is not the first argument).
- Document the dev-time usage (when/how to run extraction; where catalogs land).

## Out of scope

- Any runtime change to the package (createI18n / load / t) — already done in t0035.
- Catalog hosting / translation-platform sync (out of scope in t0035 too).

## Notes

- The `UNIMPLEMENTED` markers added to s0027 when splitting this out have been removed — extraction
  works with the stock CLI, so nothing was unbuilt (see Cancelled, above).
- No Babel/SWC in the tsc build — explicit ids make a transform unnecessary.
