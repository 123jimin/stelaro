+++
id = "s0030"
title = "i18n Catalog Workflow"
tags = ["i18n", "localization", "formatjs", "tooling"]
+++

## Behavior

- Developers run `@formatjs/cli extract` offline against TypeScript source. The
  package does not bundle the CLI, scripts, or a build transform.
- Extraction recognizes `defineMessages` declarations. A bound translator's
  descriptor-first `t(descriptor, ...)` calls can be included with
  `--additional-function-names`; locale-first `t(locale, descriptor, ...)`
  calls are not extractable because the descriptor is not the first argument.
- A source catalog maps message keys to `{ defaultMessage, description? }` and
  is handed to translators. A translation catalog maps those keys to translated
  strings and omits descriptor metadata.
- Runtime catalogs are per-locale `Record<string, string>` values consumed by
  `I18n`. Their loading, seeding, overlay, and fallback behavior belongs to
  s0027.
- A message key is its explicit descriptor `id`, or its `defaultMessage` when
  the id is absent. Final translation and runtime catalogs MUST use that same
  key. If extraction generates another id for an id-less descriptor, the
  consumer's merge step MUST remap it to the source-text key.
- No Babel or SWC transform is required: explicit ids are authored in source,
  and id-less runtime keys are derived from `defaultMessage`.

## Constraints

- Extraction MUST remain an external developer-run workflow; it MUST NOT add a
  runtime dependency or require changes to `@jiminp/stelaro-i18n`.
- Translation catalogs MUST contain translated strings only.

## Anticipated Changes

- `@formatjs/cli compile --ast` may precompile runtime catalogs after s0027's
  public `Catalog` contract is widened beyond strings. AST catalogs are not
  currently part of that contract.

## Dangers

- Translation tools may treat ICU syntax as opaque. A workflow that accepts
  translator output without ICU validation can defer malformed-message errors
  until runtime.
