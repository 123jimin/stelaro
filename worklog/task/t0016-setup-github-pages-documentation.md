+++
id = "t0016"
title = "Set up GitHub Pages for Stelaro documentation"
status = "active"
tags = ["documentation", "infrastructure"]
modifies = ["s0018"]
blocked_by = []
+++

## Scope

Set up TypeDoc-based API documentation for the stelaro monorepo, deployed to GitHub Pages via artifact-based CI. Follows the pattern established in `tooltool`.

## Work Items

- [x] Add `typedoc` as a workspace dev dependency.
- [x] Configure `typedoc.json` with entry points for all packages (`stelaro`, `stelaro-discord`, `stelaro-fastify`, `stelaro-pino`).
  - Uses `entryPointStrategy: "packages"`. Each package directory is an entry point.
  - Requires `pnpm build` before `pnpm build-docs` (packages strategy resolves from compiled `dist/`).
- [x] Add `build-docs` script to workspace root `package.json`.
- [x] Add `.github/workflows/build-docs.yaml` as a reusable workflow:
  - `actions/checkout@v6`
  - `pnpm/action-setup@v6` — install dependencies.
  - `actions/configure-pages@v6`
  - `pnpm build` (required before TypeDoc).
  - `pnpm build-docs`.
  - `actions/upload-pages-artifact@v5` — upload `docs/`.
  - `actions/deploy-pages@v5`
- [x] Extract `.github/workflows/build-test.yaml` as a reusable workflow.
- [x] Rename `.github/workflows/build.yaml` → `ci.yaml`. Call `build-test.yaml` then `build-docs.yaml`, gated on `refs/heads/main`.
- [x] Add `docs/**` to `paths-ignore` in CI trigger so doc-only pushes don't retrigger the pipeline.
- [x] Add `docs/` to `.gitignore` (generated output, not committed).
- [x] Verify generated output includes all four packages.

## Open Issues

### 1. Title shows "Documentation" instead of "Stelaro"

`"name": "Stelaro"` is set in `typedoc.json`, but the `packages` strategy ignores the root `name` option during project merge. The merged project title falls back to `"Documentation"`.

### 2. `@jiminp` scope folder in sidebar

The sidebar groups all packages under a collapsible `@jiminp` parent node (e.g., `@jiminp` > `stelaro`). This comes from the npm scope in each package's `package.json` `name` field. Per-package `typedoc.json` with `"name"` overrides was attempted but had no effect under the `packages` strategy.

### 3. Flat entity listing within packages

All exported symbols within a package are listed flat — no submodule grouping. Attempted approaches that did NOT work:

- **`@module` tags on source files** — ignored by the `packages` strategy; each package is treated as a single opaque module during merge.
- **`@module` tags on barrel index files** — same result.
- **`entryPointStrategy: "expand"` in per-package `packageOptions`** — no effect on merged output.
- **`entryPointStrategy: "resolve"` at root with submodule entry points** — TypeDoc collapses entry points sharing the same `package.json` into one module.
- **`alwaysCreateEntryPointModule: true`** — no effect.

Remaining viable approaches:

- **`@category` tags** on exports for visual grouping within a package page (no separate pages, just headings).
- **Custom static site generator** (VitePress/Starlight) with TypeDoc markdown plugin for full control over structure.

## Out of Scope

- Authored documentation (guides, getting started) — anticipated in s0018 as a future change.
- Versioned documentation.
- Custom domain.
- Search integration.
