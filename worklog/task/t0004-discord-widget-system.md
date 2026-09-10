+++
id = "t0004"
title = "Discord widget system"
tags = ["gateway", "discord"]
modifies = ["s0017"]
status = "pending"
+++

# Discord widget system (NEEDS APPROVAL)

Add opt-in helpers for recurring Discord UI patterns. They compose discord.js
builders and objects rather than wrapping the platform API.

## Completion Conditions

- Pagination combines data loading and formatting with Previous/Next controls,
  custom-id encoding, page state, and embed construction.
- `UpdatingMessage` coalesces edits made faster than the Discord cooldown and
  eventually applies the latest update.
- `IncrementalMessage` builds on `UpdatingMessage` for streaming text, splits
  at Discord's 2,000-character limit, and manages typing indicators.
- Confirm dialogs return a boolean, accept only the invoking user's response,
  time out, and clean up their controls.
- Votes support multiple options, a deadline, live tallies, and one vote per
  user.
- Widgets integrate through the gateway's existing interaction routing and are
  specified in `s0017`, with focused tests for state, timing, filtering, and
  custom ids.

## Out of Scope

- Wrappers around discord.js interaction or message objects, domain-specific
  embed builders, and general session or state-management primitives.
