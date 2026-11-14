+++
id = "t0022"
title = "Implement the Stelaro i18n package"
status = "pending"
tags = ["packages", "i18n", "localization", "formatjs"]
modifies = ["s0002", "s0003", "s0004", "s0018"]
blocked_by = []
+++

# Implement the Stelaro i18n package (NEEDS APPROVAL)

Create the browser-safe `@jiminp/stelaro-i18n` workspace package and implement s0018 with structural reader and logger contracts.
Catalog extraction is an external workflow handled by t0023.
AST catalogs and the anticipated changes in s0018 and s0019 are outside this task.

## Completion criteria

- Add the package manifest, TypeScript project, public exports, and workspace build, lint, and test integration.
  Check dependencies under s0003; use `@formatjs/intl` as specified without assuming a version.
- Implement synchronous `createI18n`, `defineMessages`, `catalogKey`, `load`, `t`, and `bind`, with the public types in s0018.
- Verify default catalog paths and locales, absent/null catalogs, seed availability before I/O, loaded-over-seeded overlays, and preservation of seed-only IDs and seeded locales outside the load list.
  The package performs no file I/O itself.
- Verify explicit-ID and source-text keys, translator descriptions, fallback order, use before loading, ICU formatting, and independent concurrent locales.
- Verify malformed messages and missing values report through the supplied logger or console without throwing or replacing fallback output.
  Missing translations do not log.
- Verify strict simple-placeholder inference, loose plural/select values, optional values only when unnecessary, and equivalent bound/unbound translator typing.
  A bound translator preserves the exact locale value and type regardless of fallback.
- Verify browser-safe runtime imports and absence of a core dependency.
  Demonstrate component-state ownership and start-hook loading through the public APIs without adding localization to core context.
- Document public exports under s0004 and pass `pnpm build`, `pnpm lint`, and `pnpm test` with runtime and type coverage.
