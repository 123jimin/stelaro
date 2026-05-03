+++
id = "t0016"
title = "Set up GitHub Pages for Peranto documentation"
status = "pending"
tags = ["documentation", "infrastructure"]
modifies = []
blocked_by = []
+++

## Scope

- Set up a documentation site for Peranto, deployed via GitHub Pages.
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

- Deploy to default `<user>.github.io/peranto`, or configure a custom domain?

## Out of Scope

- Full API reference content (separate task after initial setup).
- Auto-generated API docs from TypeScript source (may be a follow-up task).
- Versioned documentation.
