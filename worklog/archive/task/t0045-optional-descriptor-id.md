+++
id = "t0045"
title = "stelaro-i18n: optional descriptor id (source-text-keyed messages)"
status = "done"
tags = ["i18n", "stelaro-i18n", "formatjs"]
modifies = ["s0027"]
blocked_by = []
+++

## Context

Consumer review (new.r-g.kr): a root `defineMessages` block is not a satisfactory declaration
site — messages should be declarable inline where used, ideally `t({defaultMessage: "…"})` with no
id. The runtime cannot lean on a build transform to inject generated ids (consumers run the same
source under node directly and under esbuild, with no FormatJS transform), so the key must be
derivable at runtime from the descriptor itself.

## Scope

- `MessageDescriptor.id` becomes optional. An id-less descriptor is keyed by its source text:
  lookup key = `defaultMessage` (gettext msgid semantics). An explicit id keeps today's behavior
  and wins when present.
- FormatJS `formatMessage` requires an id, so `t` materializes the key onto the descriptor before
  delegating.
- `description` stays a translator note and does NOT participate in the key. If same-text messages
  must ever translate differently, that is a future deliberate context/disambiguation field, not a
  note side effect.
- s0027 amendments: descriptor type, fallback-chain wording (key = explicit id or source text),
  pipeline key wording.

## Out of scope

- Extraction tooling (t0036 cancelled stands: stock CLI; a consumer's bound `t(descriptor, …)` is
  descriptor-first, so `--additional-function-names` covers it; the unbound locale-first
  `t(locale, …)` remains non-extractable as s0027 already documents).
- The runtime catalog shape (`Record<key, string>`) — unchanged.
