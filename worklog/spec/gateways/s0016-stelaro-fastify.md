+++
id = "s0016"
title = "Fastify Gateway"
tags = ["gateway", "fastify"]
paths = ["packages/stelaro-fastify/**"]
+++

## Types

Types are shown at their widest readable form. Implementations SHOULD infer
request data from route schemas and narrow `call` to the gateway's effective
`uses`. Fastify types are imported directly.

```typescript
type GatewayHandlerContext = {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly params: unknown;
    readonly body: unknown;
    readonly querystring: unknown;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
    redirect(url: string): void;
    html(content: string): void;
};

type GatewayRoute = Omit<RouteOptions, "method" | "url" | "handler"> & {
    readonly method: HTTPMethods;
    readonly path: string;
    readonly params?: ComponentCallSchema;
    readonly body?: ComponentCallSchema;
    readonly querystring?: ComponentCallSchema;
    handle(context: GatewayHandlerContext): Promisable<unknown>;
};

type FastifyRouteGroup = {
    readonly uses: readonly ComponentCalls[];
    readonly routes: readonly GatewayRoute[];
};

type FastifyGatewayDefinition = {
    readonly id: ComponentId;
    readonly server: FastifyInstance;
    readonly uses: readonly ComponentCalls[];
    readonly mounts?: readonly FastifyRouteGroup[];
    readonly routes?: readonly GatewayRoute[];
};

type MountFastifyRoutesOptions = {
    readonly call: GatewayHandlerContext["call"];
};

const HTML_MEDIA_TYPE = "text/html; charset=utf-8";

function defineFastifyGateway(definition: FastifyGatewayDefinition): Component;
function defineFastifyRoutes(definition: FastifyRouteGroup): FastifyRouteGroup;
function route(definition: GatewayRoute): GatewayRoute;
function mountFastifyRoutes(
    server: FastifyInstance,
    group: FastifyRouteGroup<readonly []>,
): void;
function mountFastifyRoutes(
    server: FastifyInstance,
    group: FastifyRouteGroup,
    options: MountFastifyRoutesOptions,
): void;
function sendHtml(reply: FastifyReply, content: string): FastifyReply;

type RouteRequestPart = "params" | "body" | "querystring";
class RouteValidationError extends StelaroError {
    readonly statusCode: 400;
    readonly validationContext: RouteRequestPart;
}
class UnboundCallError extends StelaroError {
    readonly component_id: string;
    readonly call_name: string;
}
```

## Behavior

- The gateway receives, but does not create, a `FastifyInstance`; config
  supplies listen port and optional host.
- It composes component-owned route groups with optional gateway routes. Its
  effective `uses` is the reference-deduplicated union of gateway and mount
  dependencies, and exclusively types handler `call`. A group's `uses` type is
  inferred from `uses` alone.
- Routes specify method and path. Every other standard `RouteOptions` field is
  forwarded without interpretation.
- Optional Arktype-compatible `params`, `body`, and `querystring` schemas
  validate before the handler. Failure throws `RouteValidationError` (status
  400, the failing part as Fastify's `validationContext`, the Arktype error as
  `cause`) to the server's error handling, so without a custom error handler
  Fastify answers with its default 400 body. Success exposes inferred values;
  undeclared parts are `null`. `route()` provides per-route inference;
  schema-free routes may be inline.
- Handlers receive raw Fastify request/reply objects. `redirect` sends a
  redirect; `html` sends HTML as `sendHtml` does, typed `HTML_MEDIA_TYPE`.
- `mountFastifyRoutes` performs the registration, validation, and handler
  context above for one route group on any Fastify instance. A group that uses
  components requires `call`, which serves the handlers' calls; a group that
  uses none takes no options. A call on routes mounted without `call`, possible
  only by bypassing the types, rejects with `UnboundCallError`.
- Start mounts the gateway's own routes and every mount through
  `mountFastifyRoutes` with the component's `call`, then listens; stop closes
  the server. Both transitions log the address/close at `info` through the
  component logger.
- Access logging belongs to Fastify. Applications may unify it with Stelaro by
  supplying a gateway-id-tagged child `loggerInstance` from the shared backend
  (see s0025 `childPinoLogger`).

## Constraints

- The gateway SHOULD NOT parallel Fastify request, reply, option, or hook types.
- Standard Fastify options SHOULD pass through without validation or
  transformation.
- Calls outside effective `uses` SHOULD be rejected at the type level.

## Anticipated Changes

- Recurrent response patterns may add helpers.
