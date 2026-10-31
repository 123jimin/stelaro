+++
id = "t0011"
title = "Accept call names inherited from Object.prototype in mergeComponentCalls"
tags = ["component"]
modifies = ["s0003"]
status = "pending"
+++

# Accept call names inherited from Object.prototype in mergeComponentCalls (NEEDS APPROVAL)

Found by t0010. s0003 says `mergeComponentCalls` throws `DuplicateCallError` only when two inputs declare the same call name. `packages/stelaro/src/component/component.ts` checks names with `in`, so call names inherited from `Object.prototype` (`toString`, `constructor`, `hasOwnProperty`) count as duplicates.

## Completion conditions

- Merging surfaces whose call names match `Object.prototype` members succeeds; true duplicates still throw `DuplicateCallError`.
- The failing test "merges call surfaces whose call names match Object.prototype members" in `component.spec.ts` passes.
