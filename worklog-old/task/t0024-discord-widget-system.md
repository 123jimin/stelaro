+++
id = "t0024"
title = "Discord widget system"
status = "pending"
tags = ["gateway", "discord"]
modifies = ["s0017"]
blocked_by = ["t0010"]
+++

## Problem

Common Discord UI patterns (pagination, confirmation dialogs, streaming messages, rate-limited edits) are reimplemented from scratch in every bot. The quote board example's pagination alone spans ~60 lines across three pieces (button row builder, initial render, interaction handler). These patterns are stable and well-understood — framework-level widgets would eliminate significant boilerplate.

Widgets are opt-in helpers that compose discord.js builders rather than wrapping them, consistent with s0015's constraint against gateway abstractions over platform objects.

## Scope

### Pagination

Encapsulates the three-piece pagination pattern: initial embed, Previous/Next button row, and interaction handler for page navigation. User provides a data-fetching function and a formatter. The widget handles custom ID encoding/decoding, page state, and embed construction.

### UpdatingMessage

Rate-limited message editing with coalesced updates. When edits arrive faster than Discord allows, queues the latest and applies it when the cooldown expires. Prevents 429 rate limit errors during rapid updates.

### IncrementalMessage

Built on UpdatingMessage. Designed for streaming text (e.g. LLM token-by-token output). Accumulates text, auto-splits at Discord's 2000-character limit, and manages typing indicators.

### Confirm dialog

One-shot Yes/No dialog returning a boolean. Handles timeout, user filtering (only the invoking user can respond), and cleanup.

### Vote

Multi-option vote with configurable deadline, live tally display, and single-vote-per-user enforcement.

## Out of Scope

- Wrapping discord.js interaction/message objects.
- Domain-specific embed builders (those stay in userland).
- Session or state management primitives.

## Dependencies

- Depends on `t0010` for the core gateway (widgets register interaction handlers via the gateway's routing).
