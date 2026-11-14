+++
id = "t0017"
title = "Verify and deploy the API reference to GitHub Pages"
status = "blocked"
tags = ["documentation", "tooling"]
modifies = []
blocked_by = ["t0011", "t0012", "t0015", "t0016"]
+++

# Verify and deploy the API reference to GitHub Pages (NEEDS APPROVAL)

Verify the final public API reference and deploy the generated artifact to GitHub Pages under the previous iteration's s0018.
Use the TypeDoc build from t0015 and the passing GitHub CI workflow with the smoke test from t0016.

## Completion criteria

- Build docs from the final public entry points for both packages and verify coverage, including configuration reload and signal handling.
- Deploy on pushes to `main` after CI succeeds.
  Upload the generated site with `.nojekyll` and keep it out of Git.
- Verify that the published Pages site serves the reference for both packages.

## Verification

- Generated both package references and checked the pages for `reloadConfig`, `reloadComponentConfig`, `attachSignalHandlers`, and `definePinoLogger`.
- Checked that CI waits for the test matrix, builds the docs on `main`, uploads `docs/` including `.nojekyll`, and deploys through the `github-pages` environment.
- Repository Pages settings are handled by the maintainer. The published-site check awaits the first deployment.

Block reason: The artifact and deployment workflow are ready. Verify the published reference after the maintainer configures Pages and the first deployment succeeds.
