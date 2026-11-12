+++
id = "t0012"
title = "Implement opt-in signal handling"
status = "pending"
tags = ["application", "lifecycle", "util"]
modifies = ["s0006"]
blocked_by = ["t0010"]
+++

# Implement opt-in signal handling (NEEDS APPROVAL)

Implement and document `attachSignalHandlers` under s0006.
Keep signal handling opt-in and use the application shutdown and logging contracts.

## Completion criteria

- Verify `SIGINT` and `SIGTERM`, first-signal shutdown, duplicate-signal suppression, and cleanup of only the installed listeners.
- Verify the default timeout, a custom timeout, and `null` disabling the timeout.
- Verify logger selection, `info` on signal receipt, and `error` on timeout.
- Exercise successful shutdown, rejected stop, and timeout exit codes in child-process tests.
  Cover the specified behavior where signals are unavailable.
