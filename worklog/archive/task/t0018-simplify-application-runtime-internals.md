+++
id = "t0018"
title = "Simplify application runtime internals"
modifies = ["s0005", "s0006", "s0009"]
status = "done"
+++

# Simplify application runtime internals

Review the application directory and simplify machinery that adds no required behavior.
Preserve typed call surfaces, dependency ordering, lifecycle guards, scoped contexts, and atomic config installation.

## Completion criteria

- Review each application source module and its existing tests.
- Remove forced error ordering in concurrent config and secrets loads.
- Reduce redundant registry representations and reload routing.
- Simplify configuration installation and hook invocation.
- Verify the public application and reload entry points and reconcile s0005, s0006, and s0009.

## Review and verification

- Reviewed all six implementation modules and their application tests.
- Replaced config/secrets settlement and error-order checks with concurrent `Promise.all`.
  Tests exercise config and secrets failures independently.
- Consolidated registration into one ordered map of definitions and calls.
  Cycle validation now runs before handler validation, so a multiply invalid definition can report its cycle first.
- Removed the reload ID wrapper, optional-secrets installation protocol, and synchronous hook special case.
  Reload reuses the installed secrets reference.
- Configuration logging now emits one debug message when values are installed.
- The remaining `Promise.allSettled` collects full-reload hook failures, as required by s0009.
  Hook scopes implement s0006's permission lifetime.
  The iterative topological sort handles deep dependency graphs and reports cycles.
  Directory validation and structured error classes implement their existing public contracts.
- Confirmed coverage of s0005, s0006, and s0009.
  TypeScript build, ESLint, and the full Windows suite passed with 63 passing tests and three filesystem skips.
