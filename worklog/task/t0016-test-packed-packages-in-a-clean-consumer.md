+++
id = "t0016"
title = "Test packed packages in a clean consumer"
status = "pending"
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
