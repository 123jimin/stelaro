+++
id = "t0004"
title = "Implement core logging"
status = "done"
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

## Verification

- TypeScript and ESLint passed using the installed tools. Corepack could not resolve the registry hostname to download the pinned pnpm version.
- The compiled Node.js suite passed on Windows with 24 passing tests and three existing filesystem skips. All 27 tests passed on Linux.
- Tests cover scope prefixes, all four levels, preservation of argument values, and Node.js message formatting. A subprocess check also verified the actual stdout and stderr output.
- s0013 documents the formatting rule for t0013 and retains the implementation marker for application and component integration.
