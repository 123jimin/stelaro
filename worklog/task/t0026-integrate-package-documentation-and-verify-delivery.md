+++
id = "t0026"
title = "Integrate package documentation and verify delivery"
status = "pending"
tags = ["documentation", "packages", "tooling", "infrastructure"]
modifies = ["s0002", "s0004", "s0017", "s0018", "s0019", "s0020", "s0021", "s0023"]
blocked_by = ["t0021", "t0023", "t0025"]
+++

# Integrate package documentation and verify delivery (NEEDS APPROVAL)

Integrate the completed Fastify and i18n packages and Fastify example into the public documentation and existing delivery checks.
Follow s0004 and s0023; preserve the existing core and Pino documentation and CI coverage.
This task does not implement HMR, layout initialization, outbound gateway capabilities, the stock-market example, or anticipated changes in the specs.

## Completion criteria

- Update public package and workspace documentation for the delivered APIs, the runnable Fastify example, and the external i18n catalog workflow.
  Public usage must not require access to the worklog or repository internals (s0001).
- Add actual package entrypoints, including the Fastify client API, to TypeDoc coverage and provide package `typedoc.json` files with unscoped names.
  Verify s0004 JSDoc coverage and categories for all delivered public exports.
- Verify `pnpm build-docs` produces the complete API reference in `docs/` with `.nojekyll`, without committing generated output or using a hardcoded entrypoint glob.
- Extend clean-consumer package checks to the new packages and the Fastify client entry point.
  Verify package exports, declarations, runtime imports, and browser-safe dependency boundaries using built packages.
- Pass `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:packed` with the new packages included.
- Verify CI retains documentation-only change filtering and gates documentation deployment to `main` on successful build and tests.
  Verify the published reference after the configured deployment runs; record any external deployment prerequisite before declaring completion.
- Reconcile implementation status in the governing specs while preserving requirements still marked UNIMPLEMENTED and all stated package boundaries.
