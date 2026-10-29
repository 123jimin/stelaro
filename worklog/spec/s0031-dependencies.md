+++
id = "s0031"
title = "Dependencies"
tags = ["packages", "tooling"]
paths = ["package.json", "packages/*/package.json", "examples/*/package.json"]
+++

## Constraints

- Dependencies include every kind of `package.json` dependency.
- Human review is required if a dependency to be added is not listed below and either:
  - had no release or default-branch commit in the last 12 months, or
  - has fewer than 50,000 weekly downloads, unless published under `@jiminp`.
- Non-registry specifiers are allowed only as `workspace:*` for packages in this repository.

## Allowed packages

List only reviewed packages that fail the criteria above.

Note (non-normative): if an equivalent package meets the criteria, replacing a listed dependency with it may be suggested.

- `discord-strategy`
- `passport-google-oauth20`
