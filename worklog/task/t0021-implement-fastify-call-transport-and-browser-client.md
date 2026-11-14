+++
id = "t0021"
title = "Implement Fastify call transport and browser client"
status = "pending"
tags = ["packages", "gateway", "fastify"]
modifies = ["s0002", "s0003", "s0004", "s0017"]
blocked_by = ["t0020"]
+++

# Implement Fastify call transport and browser client (NEEDS APPROVAL)

Implement s0017's HTTP call transport and `@jiminp/stelaro-fastify/client` entry point on the route mounting provided by t0020.
This exposes existing component calls over HTTP; the UNIMPLEMENTED outbound gateway capabilities in s0016 are outside this task.

## Completion criteria

- Implement `createExposeCallsFactory`, `exposeCalls`, `not_found_routes`, and `InvalidCallEndpointError`.
  Verify rejection of invalid call names, paths outside the configured base, and local input or output schemas.
- Verify JSON POST routes preserve input, including explicit null, validate through the component call once, and return `OutputBody`.
  Convert only the exposed call's own input failure to body `RouteValidationError`; nested call input failures and other failures propagate unchanged.
- Verify GET fallback routes at the base and below it, and passthrough of the configured Fastify route `config` to all generated routes.
- Implement the shared endpoint reference, `getCallPath`, `OutputBody`, `ErrorBody`, and `isErrorBody` contracts.
- Implement typed component clients and `CallFailedError`.
  Verify omitted input becomes `{}`, explicit null stays null, successful output is unwrapped without validation, and non-OK responses retain status and the specified nullable server message.
  Server error-body formatting remains the application's responsibility.
- Verify the client entry point loads neither Fastify nor core at runtime and works with browser APIs.
- Document public exports under s0004 and pass `pnpm build`, `pnpm lint`, and `pnpm test`, including client/server round trips and call input/output type inference.
