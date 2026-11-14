+++
id = "t0014"
title = "Set up GitHub CI"
status = "done"
tags = ["tooling"]
modifies = []
+++

# Set up GitHub CI (NEEDS APPROVAL)

Add GitHub Actions checks for pull requests and pushes to `main`.
Use the repository's declared pnpm version and verify a compatible Node version.
Run on Linux and Windows to cover the filesystem behavior that differs between the two.
Follow the previous iteration's s0018 for skipping changes limited to generated `docs/**`.

## Completion criteria

- A clean checkout installs with the frozen lockfile and runs `pnpm build`, `pnpm lint`, and `pnpm test`.
- The workflow covers the workspace so the adapter is included once t0013 lands.
- Verify the workflow configuration and successful runs on both platforms.
  The packed-package check and Pages deployment are covered by t0016 and t0017.

## Verification

- Parsed all four YAML files and checked the reusable workflow references, triggers, runner matrix, permissions, and workspace commands.
- Both reusable workflows select Node.js with `lts/*`. The current Node.js 26 LTS line is supported by pnpm 11.
- Verified that `pnpm run --if-present build-docs` exits successfully before t0015 adds the script.
- [CI run #6](https://github.com/123jimin/stelaro/actions/runs/43567622899) succeeded on Ubuntu and Windows.
