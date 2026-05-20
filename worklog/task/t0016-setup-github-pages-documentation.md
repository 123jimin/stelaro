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

- [ ] Add `typedoc` as a workspace dev dependency.
- [ ] Configure `typedoc.json` with entry points for all packages (`stelaro`, `stelaro-discord`, `stelaro-fastify`, `stelaro-pino`).
- [ ] Add `build-docs` script to workspace root `package.json`.
- [ ] Add `.github/workflows/build-docs.yaml` as a reusable workflow:
  - `actions/checkout@v6`
  - `pnpm/action-setup@v6` — install dependencies.
  - `actions/configure-pages@v6`
  - Run `build-docs` script.
  - `actions/upload-pages-artifact@v5` — upload `docs/`.
  - `actions/deploy-pages@v5`
- [ ] Rename `.github/workflows/build.yaml` → `ci.yaml`. Call `build-docs.yaml` after build-test, gated on `refs/heads/main`.
- [ ] Add `docs/**` to `paths-ignore` in CI trigger so doc-only pushes don't retrigger the pipeline.
- [ ] Add `docs/` to `.gitignore` (generated output, not committed).
- [ ] Verify generated output includes all four packages.

## Out of Scope

- Authored documentation (guides, getting started) — anticipated in s0018 as a future change.
- Versioned documentation.
- Custom domain.
- Search integration.
