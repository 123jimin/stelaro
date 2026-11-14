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
| t0010, s0006 | `worklog/spec/core/s0006-application-lifecycle.md` | Record application runtime implementation status | I removed the two reload methods from the specified application API when marking the runtime implemented. The reload methods belong in the API signature with their implementation status documented separately. |
| t0010 | `packages/stelaro/src/application/application.ts` | Apply the `Any` prefix to types with erased component details | I renamed the context type and overlooked `ComponentInstance`, which also erases component-specific types. |
| t0010 | `packages/stelaro/src/application/application.ts` | Allow dependency calls during lifecycle hooks | I used `AsyncLocalStorage` for hook call permission and cast the context to `never` at invocation. A scoped call function can carry the permission, and the runtime can type the callbacks at registration. |
| t0010 | `packages/stelaro/src/application/application.ts` | Enforce declared dependency calls | I flattened the declared references into a second collection instead of checking the component's `uses` surfaces directly. |
| t0011 | `packages/stelaro/src/application/application.ts`, `packages/stelaro/src/application/component-instance.ts` | Implement configuration reload | I duplicated the staging and installation sequence from startup when adding reload. Both paths can share it, with secrets loaded only at startup. |
| t0011, t0018 | `packages/stelaro/src/application/application.ts`, `packages/stelaro/src/application/component-instance.ts`, `packages/stelaro/src/application/application.spec.ts` | Load component configurations concurrently | I enforced error ordering with `Promise.allSettled` and a test that expected config failure before secrets failure. My first correction overlooked the same machinery inside the component instance. |
| t0018, s0006 | `packages/stelaro/src/application/application.ts` | Simplify lifecycle tracking | I copied the started-component set into an array just to reverse shutdown order. Tracking completed starts as a stack allows shutdown to consume it directly. |
| t0019, s0006 | `packages/stelaro/src/application/application.ts` | Avoid a reversed shutdown copy | I replaced set membership with `Array.includes`, turning every hook-call readiness check into a linear scan. Keep the shutdown stack, but check readiness directly on the target instance. |
| t0014 | `.github/workflows/build-tests.yaml`, `.github/workflows/build-docs.yaml` | Use Node.js LTS in CI | I selected Node 24 after Node 26 had entered LTS. Use `lts/*` to follow the current LTS line. |
