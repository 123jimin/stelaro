+++
id = "s0013"
title = "Mini Stock Market Example"
tags = ["examples"]
paths = ["examples/mini-stock-market/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0013.

## Behavior

- UNIMPLEMENTED A gateway-free minimal order-matching stock market.
- UNIMPLEMENTED `Ledger` owns balances, `Exchange` matches orders, and `Ticker`
  owns price history.
- UNIMPLEMENTED `Exchange` settles through `Ledger` and records prices through
  `Ticker`.
- UNIMPLEMENTED The entrypoint calls `app.call()` directly.

## Constraints

- The example MUST NOT add a gateway or merge the three component
  responsibilities.
