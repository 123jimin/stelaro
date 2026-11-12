+++
id = "t0005"
title = "Implement component call declarations"
status = "done"
tags = ["component", "errors"]
modifies = ["s0005"]
+++

# Implement component call declarations

Implement typed call surfaces and local schema helpers in s0005.
Reuse the existing schema contract and `StelaroError` base where appropriate.
Expose the declaration types and helpers needed by component definitions in t0006.

## Completion criteria

- Verify valid lowercase kebab-case IDs, rejected invalid IDs, and correct inference for ArkType input and output types.
- Verify surface merging for a single component ID, with structured errors for mismatched IDs and duplicate call names.
- Verify that `EmptyInput` accepts the empty object and rejects arrays and objects with keys.
- Verify that local input and output factories preserve their types and are recognized by `isLocalSchema`. Verify dispatch passthrough in t0010.
- Document the public API under s0004.

## Verification

- TypeScript and ESLint passed using the installed tools. The pinned pnpm version was unavailable in the local Corepack cache.
- The compiled suite passed on Windows with 34 passing tests and three existing filesystem skips.
- The call tests cover ArkType morph inference, call reference identity after merging, structured errors, strict empty input, and local schema detection and passthrough.
