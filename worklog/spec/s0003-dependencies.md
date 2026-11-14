+++
id = "s0003"
title = "Dependencies"
tags = ["packages", "tooling"]
paths = ["package.json", "packages/*/package.json", "examples/*/package.json"]
+++

# Dependencies

## Constraints

- These rules apply to every kind of `package.json` dependency.
- Human review is required when adding a dependency absent from the reviewed list below if either condition applies:
  - It has had no release or default-branch commit in the last 12 months.
  - It has fewer than 50,000 weekly downloads and is published outside `@jiminp`.
- Non-registry specifiers are allowed only as `workspace:*` for packages in this repository.

## Reviewed dependencies

List only reviewed packages that fail the criteria above.

If an equivalent package meets the criteria, replacing a listed dependency with it may be suggested.

- `discord-strategy`
- `passport-google-oauth20`
