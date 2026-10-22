+++
id = "t0008"
title = "Route groups read gateway configuration"
tags = ["gateway", "fastify"]
modifies = ["s0016"]
status = "done"
+++

# Route groups read gateway configuration

## Problem

A handler mounted on a Fastify gateway has one way to reach the rest of the application: `call`
(`packages/stelaro-fastify/src/index.ts:413`). The gateway's own configuration is fixed to
`port` and `host` (`index.ts:22`), and the gateway serves no calls (`index.ts:396`, `:411`).
So a setting only handlers need, such as the public origin a page puts in its canonical link,
has to live in some other component and be fetched with a call on every request.

The gateway cannot serve that call itself. A mount that uses the gateway's calls puts the gateway
in its own `uses`, and `createApplication` rejects the cycle
(`packages/stelaro/src/application/application.ts:572`).

## Design

Configuration is the gateway's. The gateway declares one `config` schema, which includes the
listen settings; `FastifyGatewayConfig` is exported as the default and the base to extend.
Handlers read it on each request through `getConfig()` on their context, beside `call`. The
context's type names the schema the handler reads; the gateway's `mounts` type requires its
`config` to satisfy it.

```ts
// packages/stelaro-fastify/src/index.ts
export const FastifyGatewayConfig = schema({"port": "number", "host?": "string"});
type GatewayConfigSchema = Type<object>;
type GatewayHandlerContext<TUses, TConfig extends GatewayConfigSchema = GatewayConfigSchema, TParams, TBody, TQuerystring> =
    {...; getConfig(): TConfig["infer"]};
type GatewayRoute<TUses, TConfig = GatewayConfigSchema, ...>;   // handle(context: GatewayHandlerContext<TUses, TConfig, ...>)
type FastifyRouteGroup<TUses, TConfig = GatewayConfigSchema>;   // TConfig inferred from the routes
type FastifyGatewayDefinition<TUses, TConfig extends Type<ListenSettings> = typeof FastifyGatewayConfig, TMounts extends readonly FastifyRouteGroup<Any, TConfig>[]> =
    {...; config?: TConfig};
type MountFastifyRoutesOptions<TUses, TConfig> = {call; getConfig?: () => TConfig["infer"]};
class UnboundConfigError extends StelaroError {}            // getConfig() on routes mounted without one
```

- `TConfig` is a type only: no field on routes or groups. `defineFastifyRoute` infers it from an
  annotated `handle` parameter and `defineFastifyRoutes` from its routes; an unannotated handler
  gets `object`.
- `TConfig` sits right after `TUses` in every type, so a context that reads configuration is
  `GatewayHandlerContext<readonly [], typeof SiteConfig>` and no schema parameter needs spelling
  out to reach it.
- The `mounts` constraint checks coverage through `handle`'s bivariance: a group whose routes
  read `{count}` fits a gateway whose `config` yields `{port, host?, count}` and not one yielding
  `{port, host?}` or `{port, host?, other}`. A group that names the listen settings as well as a
  missing key would slip through; groups name what they read.
- A getter rather than the value, because `start` sees the configuration once
  (`application.ts:481`); `onConfigReload` replaces what the getter returns. `port` and `host`
  still apply at start only.
- `defineFastifyRoute` returns the types it infers instead of bare `GatewayRoute` (`index.ts:215`);
  a lone route's `TUses` alone stays wide, having nothing to infer it from.
- Three earlier designs were replaced during review: a `config` declared on every route group
  with a schema list on the gateway and identity checks; a library-intersected extension schema;
  mounts as functions of `getConfig`, called before the configuration exists. n0001 records why.
- Tests (`index.spec.ts`): `config` is the component's schema, `FastifyGatewayConfig` unless
  given, and one without the listen settings is a type error; a mounted handler reads the value
  as of the last reload and `listen` runs once; a mount reading a key the gateway lacks, with or
  without `config`, is a type error, as is reading a key from an unannotated handler;
  `mountFastifyRoutes` serves `getConfig` from its option and throws `UnboundConfigError` without
  one.

### Spec change (s0016)

Types block: `GatewayConfigSchema`, `FastifyGatewayConfig`, `getConfig()` on
`GatewayHandlerContext`, `config?` on `FastifyGatewayDefinition`, `getConfig?` on
`MountFastifyRoutesOptions`, and `UnboundConfigError`.

Behavior, first bullet, after "The gateway receives, but does not create, a `FastifyInstance`.":

> `config`, `FastifyGatewayConfig` unless given, validates its configuration and includes the
> listen settings, `port` and optional `host`.

Behavior, new bullet after the `uses` bullet:

> Handlers read the gateway's configuration through `getConfig()`, typed by the schema a route's
> context type names, which the gateway's `config` must satisfy. After a configuration reload it
> returns the new configuration; the listen settings apply at start only.

Behavior, `mountFastifyRoutes` bullet, appended:

> `getConfig` serves the handlers' `getConfig`; on routes mounted without one it throws
> `UnboundConfigError`.

Constraints, new bullet:

> A mount reading configuration the gateway's `config` lacks SHOULD be rejected at the type level.

## Outcome

Implemented, uncommitted. 18 tests pass in the package; `pnpm build`, `pnpm lint`, and `pnpm test`
pass at the workspace root.

## Completion conditions

- [x] The human has approved the s0016 text above, or replaced it.
- [x] A mounted handler reads a value of the gateway's `config` after a reload; a mount reading a
      key the gateway lacks does not typecheck.
- [x] `pnpm build`, `pnpm lint`, and `pnpm test` pass.
