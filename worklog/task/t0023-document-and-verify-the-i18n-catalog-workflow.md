+++
id = "t0023"
title = "Document and verify the i18n catalog workflow"
status = "pending"
tags = ["documentation", "i18n", "localization", "formatjs", "tooling"]
modifies = ["s0018", "s0019"]
blocked_by = ["t0022"]
+++

# Document and verify the i18n catalog workflow (NEEDS APPROVAL)

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
