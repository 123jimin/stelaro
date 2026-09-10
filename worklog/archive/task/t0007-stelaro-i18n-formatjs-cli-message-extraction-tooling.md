+++
id = "t0007"
title = "stelaro-i18n: @formatjs/cli message extraction tooling"
tags = ["i18n", "localization", "tooling", "formatjs"]
modifies = ["s0030"]
status = "cancelled"
+++

# stelaro-i18n: @formatjs/cli message extraction tooling (NEEDS APPROVAL)

## Outcome

Cancelled because no package implementation is required. Developers run the
stock `@formatjs/cli` against source; `defineMessages` and supported
descriptor-first translator calls are extractable without bundling a CLI,
script, Babel/SWC transform, or other build integration in `stelaro-i18n`.
Explicit message ids make a transform unnecessary.

Catalog hosting and translation-platform synchronization remain out of scope.
`s0030` records the supported offline workflow and its limits.

Cancellation reason: The stock @formatjs/cli already provides the required extraction workflow, so package-owned tooling is unnecessary.
