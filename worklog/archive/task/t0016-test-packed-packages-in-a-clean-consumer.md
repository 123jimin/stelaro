+++
id = "t0016"
title = "Test packed packages in a clean consumer"
status = "done"
tags = ["packages", "tooling"]
modifies = []
blocked_by = ["t0010", "t0013", "t0014"]
+++

# Test packed packages in a clean consumer (NEEDS APPROVAL)

Add a package smoke test that packs core and the Pino adapter and installs both tarballs in a clean consumer fixture.
Run the test in the GitHub CI workflow from t0014.

## Completion criteria

- Verify that the fixture resolves JavaScript and TypeScript declarations from the public entry points using the packed dependency metadata.
- Type-check the fixture and run a minimal application with the Pino adapter through start, a typed call, and stop.
- Verify that the check works outside the workspace and fails CI when package imports, declarations, or execution fail.

## Verification

- Added `pnpm test:packed` to the Ubuntu and Windows build-and-test jobs.
- In an isolated consumer, installed both archives, verified the adapter's packed dependency and peer metadata, compiled the fixture, and ran the typed call with Pino logging across start and stop.
  Local verification used an offline package store inside the consumer and a cached compatible Pino transitive dependency.
- Both build-and-test jobs, including `pnpm test:packed`, passed in [CI run #6](https://github.com/123jimin/stelaro/actions/runs/43567622899).

Block reason: Local packed-consumer verification passed. Close after t0014 records successful hosted CI runs with the smoke test on both runners.

Resume check: CI run #6 passed the Ubuntu and Windows build-and-test jobs, including the packed smoke test.
