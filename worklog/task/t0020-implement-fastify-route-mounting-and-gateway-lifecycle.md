+++
id = "t0020"
title = "Implement Fastify route mounting and gateway lifecycle"
status = "pending"
tags = ["packages", "gateway", "fastify", "lifecycle"]
modifies = ["s0002", "s0003", "s0004", "s0016", "s0017"]
blocked_by = []
+++

# Implement Fastify route mounting and gateway lifecycle (NEEDS APPROVAL)

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
