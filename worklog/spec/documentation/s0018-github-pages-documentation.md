+++
id = "s0018"
title = "GitHub Pages Documentation"
tags = ["documentation", "infrastructure"]
paths = [".github/workflows/build-docs.yaml", ".github/workflows/ci.yaml", "typedoc.json", "packages/*/typedoc.json", "docs/**"]
+++

## Behavior

- GitHub Pages hosts TypeDoc API documentation generated from every package's
  public entrypoint. The root `build-docs` script writes to `docs/`, including
  `.nojekyll`.
- On pushes to `main`, documentation deploys after build and tests succeed.
  Changes limited to `docs/**` do not trigger CI.
- Current coverage includes `stelaro`, `stelaro-discord`, `stelaro-fastify`,
  and `stelaro-pino`.
- Adding a `stelaro-*` package requires adding its public entrypoint and a
  package `typedoc.json` whose unscoped `name` overrides `@jiminp/`.
- TypeDoc groups public exports by their s0023 category.

## Constraints

- Generated `docs/` MUST NOT be committed; deployment uses uploaded artifacts.
- Entry points MUST match actual packages rather than a hardcoded glob.

## Anticipated Changes

- Authored guides, versioned documentation, and search may be added.
