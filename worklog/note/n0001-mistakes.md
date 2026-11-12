+++
id = "n0001"
title = "Mistakes"
agent_mode = "autonomous"
+++

# Mistakes

Record mistakes made while working on this repository, that were pointed out by the user. Be concise.
Similar mistakes from one session may be merged.

Exclude:
- Tool-use mistakes.
- Self-corrected mistakes.

| Relevant worklog | Relevant files | Intended task | Mistake |
| --- | --- | --- | --- |
| t0001 | `tsconfig.json`, `tsconfig.base.json`, `packages/stelaro/tsconfig.json` | Set up TypeScript for the workspace | I put the shared compiler settings in the core package and omitted the root project references. |
| t0001 | `eslint.config.mjs` | Set up linting for the workspace | I composed a local ESLint config instead of using the recommended shared config. |
| t0001 | `package.json`, `pnpm-lock.yaml` | Set up workspace dependencies | I pinned tooling versions without checking for newer compatible releases. |
| t0001 | `package.json` | Refresh workspace dependencies | I kept the Node 20 typings despite using Node 24 for the workspace toolchain. |
| t0001 | `packages/stelaro/src/fs/` | Organize the fluent filesystem | I combined the filesystem tests in a spec with no matching source module and put the shared schema type in the filesystem module. |
| t0001 | `packages/stelaro/src/test-util.ts` | Share filesystem test setup | I named the helper `makeFixture`, which hid that it creates a temporary directory. |
| t0001 | `packages/stelaro/src/fs/path.ts`, `packages/stelaro/src/fs/reader.ts` | Implement fluent paths and readers | I used ambiguous helper names and embedded confinement and decoding logic in factory closures. |
| t0009 | `packages/stelaro/src/application/lifecycle.ts` | Implement a lifecycle state machine | I put startup, shutdown, and component tracking inside the state machine. The application runtime owns those operations and drives the machine's transitions. |
| t0009 | `packages/stelaro/src/application/lifecycle.ts` | Expose a guarded state transition | I hardcoded the allowed transitions inside the machine and gave the method a name that did not clearly read as a verb. Callers supply the allowed source states. |
