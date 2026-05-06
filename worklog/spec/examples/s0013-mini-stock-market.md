+++
id = "s0013"
title = "Mini Stock Market Example"
tags = ["examples"]
paths = ["examples/mini-stock-market/**"]
+++

## Related Specs

- s0010: Examples (Common)

## Behavior

- A minimal order-matching stock market with no gateway. `UNIMPLEMENTED`
- Three components: Ledger (account balances), Exchange (order matching), Ticker (price history). `UNIMPLEMENTED`
- Exchange settles matched trades through Ledger and records prices through Ticker. `UNIMPLEMENTED`
- Entry point is `app.call()` directly. `UNIMPLEMENTED`

## Constraints

- The example must not introduce a gateway component.
- Component responsibilities must remain split across Ledger, Exchange, and Ticker.

## Anticipated Changes

- None recorded.

## Dangers

- Collapsing Ledger, Exchange, and Ticker into a single component would erase the demonstration of typed inter-component calls.
- Introducing a gateway would defeat the example's role of showing direct `app.call()` use.
