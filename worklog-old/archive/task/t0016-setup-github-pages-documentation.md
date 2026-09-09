+++
id = "t0016"
title = "Set up GitHub Pages for Stelaro documentation"
status = "done"
tags = ["documentation", "infrastructure"]
modifies = ["s0018"]
blocked_by = []
+++

## Scope

Set up TypeDoc-based API documentation for the stelaro monorepo, deployed to GitHub Pages via artifact-based CI. Follows the pattern established in `tooltool`.

## Work Items

- [x] Add `typedoc` as a workspace dev dependency.
- [x] Configure `typedoc.json` with entry points for all packages (`stelaro`, `stelaro-discord`, `stelaro-fastify`, `stelaro-pino`).
  - Uses `entryPointStrategy: "packages"`. Each package directory is an entry point.
  - Requires `pnpm build` before `pnpm build-docs` (packages strategy resolves from compiled `dist/`).
- [x] Add `build-docs` script to workspace root `package.json`.
- [x] Add `.github/workflows/build-docs.yaml` as a reusable workflow:
  - `actions/checkout@v6`
  - `pnpm/action-setup@v6` — install dependencies.
  - `actions/configure-pages@v6`
  - `pnpm build` (required before TypeDoc).
  - `pnpm build-docs`.
  - `actions/upload-pages-artifact@v5` — upload `docs/`.
  - `actions/deploy-pages@v5`
- [x] Extract `.github/workflows/build-test.yaml` as a reusable workflow.
- [x] Rename `.github/workflows/build.yaml` → `ci.yaml`. Call `build-test.yaml` then `build-docs.yaml`, gated on `refs/heads/main`.
- [x] Add `docs/**` to `paths-ignore` in CI trigger so doc-only pushes don't retrigger the pipeline.
- [x] Add `docs/` to `.gitignore` (generated output, not committed).
- [x] Verify generated output includes all four packages.
- [x] Fix project title showing "Documentation" instead of "Stelaro".
  - Resolved in TypeDoc 0.28.19 — the root `name` option is now respected.
- [x] Remove `@jiminp` scope folder from sidebar navigation.
  - `navigation.includeFolders: false` in `typedoc.json`.
  - Per-package `typedoc.json` with `"name"` overrides to strip scope from module names (works in 0.28.19).
- [x] Add `@category` tags to all exported symbols for grouped navigation.
  - Categories per package documented below.
- [x] Move `useFirstParagraphOfCommentAsSummary` from `packageOptions` to root (fixes misplaced-option warning).

## Categories

### stelaro

| Category | Symbols |
|----------|---------|
| Application | `Application`, `ApplicationDefinition`, `ApplicationOptions`, `ParsedArgs`, `createApplication`, `defineApplication` |
| Lifecycle | `LifecycleMachine`, `LifecycleState`, `createLifecycleMachine` |
| Component | `AnyComponent`, `ComponentCallSchema`, `AnyComponentCallReference`, `AnyComponentCalls`, `AnyComponentContext`, `CallFrom`, `CallInput`, `CallOutput`, `Component`, `ComponentCallDeclarations`, `ComponentCallName`, `ComponentCallReference`, `ComponentCalls`, `ComponentContext`, `ComponentId`, `StateFactory`, `defineComponent`, `defineComponentCalls`, `isValidComponentId` |
| Configuration | `ConfigSchema` |
| Logging | `Logger`, `LoggerFactory`, `consoleLoggerFactory` |
| Errors | All error classes (`StelaroError`, `InvalidComponentIdError`, `CircularDependencyError`, etc.) |

### stelaro-discord

| Category | Symbols |
|----------|---------|
| Commands | `command`, `CommandDefinition`, `CommandHandlerContext`, `AutocompleteChoice`, `AutocompleteHandlerContext`, `AutocompleteMap`, `AutocompleteResult` |
| Events | `event`, `EventDefinition`, `EventHandlerContext` |
| Interactions | `interaction`, `InteractionDefinition`, `InteractionHandlerContext`, `InteractionParams` |
| Gateway | `defineDiscordGateway`, `DiscordGatewayDefinition` |
| Mounts | `defineDiscordMounts`, `DiscordMountGroup` |

### stelaro-fastify

| Category | Symbols |
|----------|---------|
| Gateway | `defineFastifyGateway`, `FastifyGatewayDefinition` |
| Routes | `route`, `defineFastifyRoutes`, `FastifyRouteGroup`, `GatewayHandlerContext`, `GatewayRoute` |

## Out of Scope

- Authored documentation (guides, getting started) — anticipated in s0018 as a future change.
- Versioned documentation.
- Custom domain.
- Search integration.
