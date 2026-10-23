+++
id = "s0016"
title = "Fastify Gateway"
tags = ["gateway", "fastify"]
paths = ["packages/stelaro-fastify/**"]
+++

## Types

Types are shown at their widest readable form. Implementations SHOULD infer
request data from route schemas and narrow `call` to the route group's `uses`.
Fastify types are imported directly.

```typescript
type GatewayHandlerContext = {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly params: unknown;
    readonly body: unknown;
    readonly querystring: unknown;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
    getConfig(): unknown;
    redirect(url: string, is_permanent?: boolean): void;
    redirect(url: string, status: number): void;
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
    readonly config?: ConfigSchema;
    readonly mounts?: readonly FastifyRouteGroup[];
    readonly routes?: readonly GatewayRoute[];
};

type MountFastifyRoutesOptions = {
    readonly call: GatewayHandlerContext["call"];
    readonly getConfig?: () => unknown;
};

const HTML_MEDIA_TYPE = "text/html; charset=utf-8";
const JSON_MEDIA_TYPE = "application/json; charset=utf-8";

function defineFastifyGateway(definition: FastifyGatewayDefinition): Component;
function defineFastifyRoutes(definition: FastifyRouteGroup): FastifyRouteGroup;
function defineFastifyRoute(definition: GatewayRoute): GatewayRoute;
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
class NotFoundError extends StelaroError {
    readonly statusCode: 404;
}
class UnboundCallError extends StelaroError {
    readonly component_id: string;
    readonly call_name: string;
}
class UnboundConfigError extends StelaroError {}

type ExposeCallsFactoryOptions = {
    readonly callPath: (reference: CallEndpointReference) => string;
    readonly base: string;
    readonly config?: FastifyContextConfig;
};
type ExposeCallsFactory = {
    exposeCalls(calls: ComponentCalls): FastifyRouteGroup;
    readonly not_found_routes: FastifyRouteGroup<readonly []>;
};
function createExposeCallsFactory(options: ExposeCallsFactoryOptions): ExposeCallsFactory;
class InvalidCallEndpointError extends StelaroError {
    readonly component_id: string;
    readonly call_name: string;
}

// `@jiminp/stelaro-fastify/client`
type CallEndpointReference = {
    readonly component_id: ComponentId;
    readonly name: ComponentCallName;
};
function getCallPath(base: string, reference: CallEndpointReference): string;
type OutputBody<T = unknown> = {readonly output: T};
type ErrorBody = {readonly error: string};
function isErrorBody(body: unknown): body is ErrorBody;
type CallFunction = (input?: unknown) => Promise<unknown>;
type ComponentClient = (name: ComponentCallName) => CallFunction;
type ComponentClientFactory = (component_id: ComponentId) => ComponentClient;
type ComponentClientFactoryOptions = {
    readonly callPath: (reference: CallEndpointReference) => string;
};
function createComponentClientFactory(options: ComponentClientFactoryOptions): ComponentClientFactory;
class CallFailedError extends Error {
    readonly status: number;
    readonly server_message: string | null;
}
```

## Behavior

- The gateway receives, but does not create, a `FastifyInstance`.
  Its configuration is the listen settings, `port` and optional `host`, and
  the output of `config` when given. `config` receives every key but the
  listen settings.
- It composes component-owned route groups with optional gateway routes. Its
  effective `uses` is the reference-deduplicated union of gateway and mount
  dependencies. Handler `call` is typed by its own group's `uses`, not by that
  union. A group's `uses` type is inferred from `uses` alone.
- Handlers read the gateway's configuration through `getConfig()`, typed by
  the configuration type a route's context names. The output of the gateway's
  `config` must satisfy that type. After a configuration reload `getConfig()`
  returns the new configuration; the listen settings apply at start only.
- Routes specify method and path. Every other standard `RouteOptions` field is
  forwarded without interpretation.
- Optional Arktype-compatible `params`, `body`, and `querystring` schemas
  validate before the handler. Failure throws `RouteValidationError` (status
  400, the failing part as Fastify's `validationContext`, the Arktype error as
  `cause`) to the server's error handling, so without a custom error handler
  Fastify answers with its default 400 body. Success exposes inferred values;
  undeclared parts are `null`. `defineFastifyRoute()` provides per-route
  inference; schema-free routes may be inline.
- Handlers receive raw Fastify request/reply objects. `redirect` sends a
  redirect with the given status. Without one, a permanent redirect sends 308,
  and a temporary one sends 307 for GET and HEAD and 303 for other methods, so
  that the browser follows up with a GET. `html` sends HTML as `sendHtml` does,
  typed `HTML_MEDIA_TYPE`.
- Handlers signal a missing resource by throwing `NotFoundError` (status 404) to the server's error handling.
- `mountFastifyRoutes` performs the registration, validation, and handler
  context above for one route group on any Fastify instance. A group that uses
  components requires `call`, which serves the handlers' calls; a group that
  uses none takes no options. A call on routes mounted without `call`, possible
  only by bypassing the types, rejects with `UnboundCallError`.
  `getConfig` serves the handlers' `getConfig`; on routes mounted without one it
  throws `UnboundConfigError`.
- Start mounts the gateway's own routes and every mount through
  `mountFastifyRoutes` with the component's `call` and the current
  configuration as `getConfig`, then listens; stop closes
  the server. Both transitions log the address/close at `info` through the
  component logger.
- Access logging belongs to Fastify. Applications may unify it with Stelaro by
  supplying a gateway-id-tagged child `loggerInstance` from the shared backend
  (see s0025 `childPinoLogger`).

### Call transport

- `createExposeCallsFactory` creates `exposeCalls`, which
  serves component calls over HTTP at the paths `callPath` returns.
  `exposeCalls` serves each call of a surface as a JSON `POST` and passes the
  request body, `null` included, to `call` unchanged, so the call's schema
  validates it once. It replies with the output in an `OutputBody`. If the
  call's own input fails, the route throws `RouteValidationError` for `body`.
  Every other failure, a nested call's input failure included, propagates unchanged.
- `exposeCalls` throws `InvalidCallEndpointError` for a call
  name with characters other than ASCII letters, digits, `_`, and `-`, or a
  path not under `${base}/`. `not_found_routes` answers a `GET` of `base` or
  any path under it with `NotFoundError`. `config` is the Fastify route
  `config` of every route either creates.
- `getCallPath` returns `${base}/${component_id}/${name}`, escaping neither part, for use as `callPath` on both sides.
- The `./client` entry loads neither Fastify nor stelaro at runtime.
  `createComponentClientFactory` returns a factory of typed clients
  that send a call's input as a JSON `POST` to `callPath`, which must match
  the server's. An omitted input is sent as `{}`, an explicit `null` as
  `null`. An OK response resolves to its `OutputBody`'s `output`, without
  output validation. Any other response rejects with `CallFailedError`,
  whose `server_message` is the `error` of a non-OK `ErrorBody` response,
  otherwise `null`. The server's error handler must send `ErrorBody`; the
  package sends none.

## Constraints

- The gateway SHOULD NOT parallel Fastify request, reply, option, or hook types.
- Standard Fastify options SHOULD pass through without validation or
  transformation.
- Calls outside a group's `uses` SHOULD be rejected at the type level.
- A route reading configuration the gateway's `config` lacks SHOULD be rejected at the type level.

## Anticipated Changes

- Recurrent response patterns may add helpers.
