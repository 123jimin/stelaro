+++
id = "t0016"
title = "Set up GitHub Pages for Stelaro documentation"
status = "pending"
tags = ["documentation", "infrastructure"]
modifies = []
blocked_by = []
+++

## Scope

- Set up a documentation site for Stelaro, deployed via GitHub Pages.
- Choose and configure a static site generator.
- Set up GitHub Actions workflow for automated deployment on push to main.
- Create initial documentation structure (landing page, getting started, API reference outline).

## Design Questions

### Q1: Static site generator

Options:
- **VitePress** — Vue-based, lightweight, good TypeScript docs ecosystem. Used by Vue, Vite, Pinia.
- **Starlight** — Astro-based, content-focused, built-in i18n and search. Used by Astro, Biome.
- **Docusaurus** — React-based, mature, plugin ecosystem. Used by many Meta OSS projects.
- **Other** — specify.

### Q2: Documentation scope for initial setup

- **A. Minimal.** Landing page + placeholder structure only. Content written in later tasks.
- **B. Seed content.** Landing page + getting started guide + core API reference from current implementation.

### Q3: Custom domain

- Deploy to default `<user>.github.io/stelaro`, or configure a custom domain?

## Out of Scope

- Full API reference content (separate task after initial setup).
- Auto-generated API docs from TypeScript source (may be a follow-up task).
- Versioned documentation.

## Reference Documentation Setup

Observed documentation setup:

- Uses TypeDoc, configured in `typedoc.json`.
- `package.json` includes `build-docs` and `build-docs:watch` scripts that run TypeDoc.
- `typedoc.json` uses the default theme and resolves entry points from `src/*/index.ts`.
- Generated HTML is written under `docs/`, with TypeDoc's `.nojekyll` file present for GitHub Pages.
- README links to published GitHub Pages documentation.
- No `CNAME` file is present, so no custom domain setup is visible in the repository.
- GitHub Actions has a reusable `build-docs.yaml` workflow that:
  - checks out the repository,
  - installs with `pnpm/action-setup`,
  - runs `actions/configure-pages`,
  - runs `pnpm build-docs`,
  - uploads `./docs` with `actions/upload-pages-artifact`,
  - deploys with `actions/deploy-pages`.
- `ci.yaml` calls the docs workflow after `build-test`, only on `refs/heads/main`.
- `ci.yaml` ignores pushes that only touch `docs/**`, so generated documentation-only changes do not retrigger CI.

Implications for Stelaro:

- The closest matching setup would be TypeDoc plus GitHub Pages artifact deployment.
- Stelaro should decide whether docs are generated output in `docs/`, or source-authored docs with generated API references as a later step.
- If using TypeDoc for API docs, Stelaro needs entry points chosen from its package structure rather than copying the observed `src/*/index.ts` pattern blindly.
