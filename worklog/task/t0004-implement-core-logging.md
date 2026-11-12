+++
id = "t0004"
title = "Implement core logging"
status = "pending"
tags = ["logging"]
modifies = ["s0013"]
+++

# Implement core logging

Implement and export `Logger`, `LoggerFactory`, and `consoleLoggerFactory` from core under s0013.
Keep the contract independent of backends under s0002.
The Pino adapter in t0013 and runtime wiring in t0010 consume this contract.

## Completion criteria

- Verify that each factory scope prefixes output and that `debug`, `info`, `warn`, and `error` invoke the matching console methods.
- Verify preservation of arbitrary arguments and establish the message formatting behavior the adapter should match.
- Document the public exports and members under s0004.
