+++
id = "t0019"
title = "Remove application dispatch performance regressions"
modifies = ["s0005", "s0006", "s0009"]
status = "done"
+++

# Remove application dispatch performance regressions

Audit application runtime scans and allocations after the simplification work.
Preserve the existing lifecycle, call authorization, reference validation, and reload contracts.

## Completion criteria

- Restore constant-time started-component checks without making a reversed shutdown copy.
- Remove repeated dependency and call-surface scans from dispatch.
- Review the remaining application modules for similarly avoidable work.
- Verify multiple dependency surfaces, lifecycle calls, shutdown failures, and reload behavior.
- Record the user-identified regression in n0001 and reconcile s0005, s0006, and s0009.

## Review and verification

- Reviewed all six application implementation modules and the adjacent declaration and configuration-loading code.
- Replaced the started-stack membership scan with a per-instance readiness flag.
  The instance clears readiness before a hook and sets it only after a successful start.
  The application still pops completed starts for shutdown, without creating a reversed copy.
- Indexed dependency references once by component ID and call name.
  Dispatch no longer scans `uses` or allocates an `Object.values` array.
  Multiple surfaces for one component are combined, and reference identity remains checked.
- Replaced reload error `flatMap` with a loop that avoids an intermediate array for each result.
- Kept the bounded lifecycle-state check, linear registration and sorting work, cold cycle diagnostics, and required parallel configuration staging.
  Configuration loading retains the base-before-overlay contract in s0009.
- Added coverage for repeated surfaces and equal call names on different components.
  Dependency-hook cleanup now runs through two start/stop cycles.
- A separate operation-count check performed 2,000 dependency calls with 500 declared dependencies and observed no declaration rereads during dispatch.
- Confirmed existing s0005, s0006, and s0009 behavior needs no spec changes.
  TypeScript, ESLint, and whitespace checks passed.
  The full Windows suite passed with 65 passing tests and three platform filesystem skips.
