+++
id = "t0023"
title = "Document and verify the i18n catalog workflow"
status = "done"
tags = ["documentation", "i18n", "localization", "formatjs", "tooling"]
modifies = ["s0018", "s0019"]
blocked_by = ["t0022"]
+++

# Document and verify the i18n catalog workflow

Provide public, runnable documentation for the external developer-run catalog workflow in s0019 against the package delivered by t0022.
Do not bundle the extraction CLI, scripts, or build transforms into the package or add a runtime extraction dependency.

## Completion criteria

- Demonstrate offline `@formatjs/cli extract` for `defineMessages` and descriptor-first bound translator calls using `--additional-function-names`.
  Explain why locale-first calls are not extractable.
- Show source descriptors with translator context, translated string-only catalogs, and per-locale runtime loading.
- Verify explicit IDs remain keys and id-less descriptors use their source text at runtime.
  Demonstrate remapping extractor-generated IDs in the consumer's merge step when necessary.
- Verify an extracted and translated catalog loads through the public `I18n` API and preserves the specified seeding, overlay, and fallback behavior.
- Document that no Babel/SWC transform is required, AST catalogs are outside the contract, and accepting translations without ICU validation can defer errors until runtime.
- Run the documented commands with a checked CLI version and record the result.
  Keep temporary extraction tooling outside package runtime dependencies.

## Verification

- Installed the packed `@jiminp/stelaro-i18n@0.0.1` in a separate consumer because the registry returned 404 for that version.
  Verified the consumer's dev dependency with `pnpm list @formatjs/cli --depth 0` (`6.7.4`).
  Used Node.js `24.11.1` and pnpm `11.5.1`.
- Ran the guide's extraction command offline.
  The result matched the documented source catalog, including the explicit `greeting` ID, the generated `Rw7t5q` ID, and both descriptions.
  The inline locale-first call was skipped.
- Ran `node merge.mjs` and matched the documented French catalog.
  `node verify.ts` confirmed explicit and source-text lookups, per-locale paths, seeds before loading, overlay precedence, seed retention, and source and literal-key fallback through the public API.
  Both TypeScript snippets passed strict type checking.
- `pnpm build`, `pnpm lint`, and `pnpm test` passed.
  The existing i18n tests covered fallback and logging for malformed ICU.
  The packed package includes the guide and keeps extraction tooling external.
  s0018 required no runtime or spec changes.
