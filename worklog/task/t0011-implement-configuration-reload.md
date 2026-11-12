+++
id = "t0011"
title = "Implement configuration reload"
status = "pending"
tags = ["application", "config", "lifecycle"]
modifies = ["s0006", "s0009"]
blocked_by = ["t0010"]
+++

# Implement configuration reload (NEEDS APPROVAL)

Implement `reloadConfig` and `reloadComponentConfig` under s0006 and s0009.
Use the configuration loader and lifecycle controller through the application runtime.

## Open spec decision

Specify the resulting lifecycle state after reload validation fails and after a targeted component reload hook throws.

## Completion criteria

- Verify that full reload validates every replacement before any swap, and that validation failure preserves all previous values.
- Verify that all component hooks see swapped values, run concurrently, and settle before full reload reports errors.
  Verify that component hook failures aggregate, skip the application hook, and move the application to `failed`.
  Verify application hook failure handling as well.
- Verify that targeted reload accepts only registered IDs at the type level, reports an unregistered component at runtime, and swaps only the selected config before calling its hook.
- Verify that both paths preserve secrets and component state and enforce the specified lifecycle guards.
- Document both methods under s0004.
