+++
id = "t0020"
title = "Implement Fastify route mounting and gateway lifecycle"
status = "done"
tags = ["packages", "gateway", "fastify", "lifecycle"]
modifies = ["s0002", "s0003", "s0004", "s0016", "s0017"]
blocked_by = []
+++

# Implement Fastify route mounting and gateway lifecycle

Create the `@jiminp/stelaro-fastify` workspace package and implement the route and gateway contracts in s0016 and s0017.
Use the current core declarations and configuration model in s0005 and s0009 when expressing the spec's widest-form types.
The call transport and browser client are handled by t0021.
Typed outbound gateway capabilities marked UNIMPLEMENTED remain outside this task.

## Completion criteria

- Add the package manifest, TypeScript project, exports, and workspace build, lint, and test integration.
  Check dependencies under s0003 without assuming current versions or introducing unreviewed dependencies.
- Implement `defineFastifyRoute`, `defineFastifyRoutes`, `mountFastifyRoutes`, and `defineFastifyGateway` using the caller-owned Fastify instance and native Fastify types.
- Verify route option passthrough, component-owned mounts, reference-deduplicated dependencies, and inference from each group's own `uses`.
  Type checks reject undeclared calls and incompatible route configuration.
- Verify params, body, and querystring validation and inference, null undeclared parts, `RouteValidationError` metadata and cause, and propagation to Fastify's error handling.
- Implement and verify `sendHtml`, media-type constants, redirect status selection, `NotFoundError`, `UnboundCallError`, and `UnboundConfigError`.
- Verify listen settings, custom configuration validation, current configuration after reload, mounting before listen, server close on stop, and lifecycle logging.
  Access logging remains caller-owned, including optional use of s0014's `childPinoLogger`.
- Document public exports under s0004 and pass `pnpm build`, `pnpm lint`, and `pnpm test` with runtime and type coverage for the contracts above.

## Findings

- `fastify` 5.12.8 meets s0003 (about 22.5M weekly downloads, published 2026-11-02). It is a peer and dev dependency; `@jiminp/stelaro-pino` and `pino` are dev dependencies for the `childPinoLogger` type check.
- A `defineFastifyRoute` route cannot see its group's `uses`, so its `call` stays wide. Inline routes are narrowed to the group's `uses`. At runtime, core rejects calls outside the gateway's effective `uses` with `UndeclaredCallError`.
- A handler names its configuration type by annotating its context as `GatewayHandlerContext<TUses, TConfig>`. `mountFastifyRoutes` requires `getConfig` when a group names a configuration type.
- ArkType's `assert` accepts `ArkErrors` returned from a morph, so the gateway's configuration schema asserts the nested `config` inside its morph. Core wraps the thrown error in `ConfigValidationError`.
- Fastify instances cannot listen again after `close`, so an application containing a gateway fails a second `start()` after `stop()`, which s0006 allows. The second start throws `FST_ERR_INSTANCE_ALREADY_LISTENING` while mounting routes.
- Requests still in flight while the gateway stops use the stop hook's call permission, so they can still call dependencies.
- README and TypeDoc integration remain with t0026.
- Verification: workspace `pnpm build`, `pnpm lint`, and `pnpm test` pass (14 Fastify tests). A TypeDoc run including the package reports no missing documentation for it.

Block reason: Awaiting human acceptance of wide defineFastifyRoute call typing and a decision on gateway restart versus s0006; resume after acceptance and NEEDS APPROVAL review.

Resume check: Human reviewed and committed route and gateway code (29379e6, 677c065) accepting wide defineFastifyRoute call typing and single-start Fastify lifecycle, and cleared approval markers on t0020.
