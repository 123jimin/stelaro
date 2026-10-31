+++
id = "t0011"
title = "Accept call names inherited from Object.prototype in mergeComponentCalls"
tags = ["component"]
modifies = ["s0003"]
status = "done"
+++

# Accept call names inherited from Object.prototype in mergeComponentCalls

Found by t0010. s0003 says `mergeComponentCalls` throws `DuplicateCallError` only when two inputs declare the same call name. `packages/stelaro/src/component/component.ts` checks names with `in`, so call names inherited from `Object.prototype` (`toString`, `constructor`, `hasOwnProperty`) count as duplicates.

## Completion conditions

- Merging surfaces whose call names match `Object.prototype` members succeeds; true duplicates still throw `DuplicateCallError`.
- The failing test "merges call surfaces whose call names match Object.prototype members" in `component.spec.ts` passes.

## Outcome

- `mergeComponentCalls` checks names it has collected instead of using `in`, and both it and `defineComponentCalls` build call records with `Object.fromEntries`, so `__proto__` is also an ordinary call name rather than a prototype assignment. The test now covers `__proto__`.
- s0003 needed no change. Root `pnpm build`, `pnpm lint`, and every package's `pnpm test` pass (stelaro: 228 pass, 3 platform skips).
