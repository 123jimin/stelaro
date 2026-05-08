+++
id = "s0016"
title = "Fastify Gateway"
tags = ["gateway", "fastify"]
paths = ["packages/peranto-fastify/**"]
+++

## Related Specs

- s0015: Gateways (Common)
- s0012: Fastify Web Server Example

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `call` accepts only references from the gateway's `uses` declarations, with input/output types inferred from the reference. Fastify types (`FastifyInstance`, `FastifyRequest`, `FastifyReply`, `RouteGenericInterface`, `RouteOptions`, `HTTPMethods`) are used directly from the `fastify` package — the gateway must not redefine them.

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

type GatewayRoute =
    & Omit<RouteOptions, "method" | "url" | "handler">
    & {
        readonly method: HTTPMethods;
        readonly path: string;
        readonly params?: ComponentCallSchema;
        readonly body?: ComponentCallSchema;
        readonly querystring?: ComponentCallSchema;
        handle(context: GatewayHandlerContext): Promisable<unknown>;
    };

type FastifyGatewayDefinition = {
    readonly id: ComponentId;
    readonly server: FastifyInstance;
    readonly uses: readonly ComponentCalls[];
    readonly routes: readonly GatewayRoute[];
};

function defineFastifyGateway(definition: FastifyGatewayDefinition): Component;
function route(definition: GatewayRoute): GatewayRoute;
```

## Behavior

### Gateway definition

- A Fastify gateway is a Peranto component that bridges HTTP requests to component calls.
- A gateway declares which component call surfaces it uses. The component dispatch function is typed exclusively from these declarations.
- A gateway receives a Fastify instance and registers its routes on it. The gateway does not create its own instance.
- Server listen port and optional host are read from component config.

### Route definitions

- Each route specifies an HTTP method and path.
- Route definitions accept all standard Fastify route options and forward them without interpretation via `Omit<RouteOptions, "method" | "url" | "handler">`.
- Each route has a handler that receives the Fastify request and reply objects alongside Peranto-provided helpers.

### Route schema validation

- Routes may declare optional `params`, `body`, and `querystring` fields as ArkType-compatible schemas (`ComponentCallSchema`).
- When a schema is declared, the gateway validates the corresponding request data against it before calling the handler. Validation failure responds with HTTP 400.
- The handler context exposes `params`, `body`, and `querystring` fields containing the validated data. When no schema is declared, the field is `undefined`.
- The `route` helper function infers handler context types from declared schemas, eliminating the need for type casts on request data. Routes without schemas may be defined inline without the helper.

### Response helpers

- The redirect helper sends an HTTP redirect response.
- The html helper sends an HTML response with the correct content type.

### Lifecycle

- The gateway registers routes during its component start hook and begins listening.
- The gateway closes the server during its component stop hook.
## Constraints

- The gateway must not define types that parallel Fastify's own types for requests, replies, route options, or hooks.
- The gateway must not interpret, validate, or transform any standard Fastify route option — only forward it.
- The component dispatch function must reject calls not declared in the gateway's dependency list at the type level.

## Anticipated Changes

- Additional response helpers may be added if common patterns emerge across examples.

## Dangers

- Introducing gateway-level middleware hooks would blur the boundary between Fastify-level and gateway-level concerns.
- Wrapping Fastify's request or reply in gateway-specific types would create a parallel type system that diverges over time.
