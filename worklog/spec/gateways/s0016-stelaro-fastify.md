+++
id = "s0016"
title = "Fastify Gateway"
tags = ["gateway", "fastify"]
paths = ["packages/stelaro-fastify/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0016.

## Types

Types are shown at their widest readable form. Implementations MUST infer
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

function defineFastifyGateway(definition: FastifyGatewayDefinition): Component;
function defineFastifyRoutes(definition: FastifyRouteGroup): FastifyRouteGroup;
function route(definition: GatewayRoute): GatewayRoute;
```

## Behavior

- The gateway receives, but does not create, a `FastifyInstance`; config
  supplies listen port and optional host.
- It composes component-owned route groups with optional gateway routes. Its
  effective `uses` is the reference-deduplicated union of gateway and mount
  dependencies, and exclusively types handler `call`.
- Routes specify method and path. Every other standard `RouteOptions` field is
  forwarded without interpretation.
- Optional Arktype-compatible `params`, `body`, and `querystring` schemas
  validate before the handler. Failure responds HTTP 400; success exposes
  inferred values. Undeclared fields are `undefined`. `route()` provides
  per-route inference; schema-free routes may be inline.
- Handlers receive raw Fastify request/reply objects. `redirect` sends a
  redirect; `html` sends HTML with the correct content type.
- Start registers routes and listens; stop closes the server. Both transitions
  log the address/close at `info` through the component logger.
- Access logging belongs to Fastify. Applications may unify it with Stelaro by
  supplying a gateway-id-tagged child `loggerInstance` from the shared backend.

## Constraints

- The gateway MUST NOT parallel Fastify request, reply, option, or hook types.
- Standard Fastify options MUST pass through without validation or
  transformation.
- Calls outside effective `uses` MUST be rejected at the type level.

## Anticipated Changes

- Recurrent response patterns may add helpers.
