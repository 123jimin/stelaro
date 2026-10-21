+++
id = "t0008"
title = "Route groups read gateway configuration"
tags = ["gateway", "fastify"]
modifies = ["s0016"]
status = "pending"
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

The gateway lists the schemas its configuration includes; its configuration schema is the listen
settings intersected with that list, so Stelaro validates the file at start and on reload. A route
group declares the one schema its handlers read, and it must be on the gateway's list: a mount
declaring an unlisted schema fails when the gateway is defined. A handler reads the current
configuration through `getConfig()`, typed by its group's schema.

```ts
// packages/stelaro-fastify/src/index.ts
type GatewayConfigSchema = Type<object>; // arktype Type, not stelaro's ConfigSchema

type GatewayHandlerContext<TUses, TParams, TBody, TQuerystring, TConfig = null> =
    {...} & (TConfig extends GatewayConfigSchema ? {getConfig(): TConfig["infer"]} : {});
type GatewayRoute<TUses, TParams, TBody, TQuerystring, TConfig = null> =
    {...; handle(context: GatewayHandlerContext<TUses, ..., TConfig>): Promisable<unknown>};
type FastifyRouteGroup<
    TUses, TConfig extends Nullable<GatewayConfigSchema> = Nullable<GatewayConfigSchema>,
> = {uses: TUses; config?: TConfig; routes: readonly GatewayRoute<NoInfer<TUses>, ..., NoInfer<TConfig>>[]};
type FastifyGatewayDefinition<TUses, TMounts> = {...; config?: readonly GatewayConfigSchema[]};
type MountFastifyRoutesOptions<TUses, TConfig> =
    (TUses extends readonly [] ? {call?: never} : {call: ComponentCallFn<TUses>})
    & (TConfig extends GatewayConfigSchema ? {getConfig: () => TConfig["infer"]} : {getConfig?: never});

class UnlistedConfigError extends StelaroError {}   // a mount's config is not in the gateway's config

function defineFastifyRoute<TParams, TBody, TQuerystring, TConfig extends Nullable<GatewayConfigSchema> = null>(
    definition: GatewayRoute<readonly AnyComponentCalls[], TParams, TBody, TQuerystring, TConfig>,
): GatewayRoute<readonly AnyComponentCalls[], TParams, TBody, TQuerystring, TConfig>;
function defineFastifyRoutes<const TUses, const TConfig extends Nullable<GatewayConfigSchema> = null>(
    group: FastifyRouteGroup<TUses, TConfig>): FastifyRouteGroup<TUses, TConfig>;
function mountFastifyRoutes(server, group: FastifyRouteGroup<readonly [], Nullish>): void;
function mountFastifyRoutes<TUses, TConfig>(
    server, group: FastifyRouteGroup<TUses, TConfig>, options: MountFastifyRoutesOptions<TUses, TConfig>,
): void;

function defineFastifyGateway(definition) {
    // a mount whose config is not (===) in definition.config: throw UnlistedConfigError
    // config: definition.config folded onto FastifyGatewayConfig with .and, then cast back to the
    //   listen settings' type, which is all start reads
    // start: current = context.config; mount every group with {call, getConfig: () => current}
    // onConfigReload: current = context.config
}
```

Why these shapes:

- A list on the gateway rather than schemas inferred from the mounts, so the gateway definition
  states what its configuration file must contain, and a mount's unmet requirement fails at
  definition time by identity. One declared schema instead of a list would leave that requirement
  unverifiable: against validated output a mount's morphs would run again, and a type-level check
  of one schema against another is generics whose errors name nothing.
- `getConfig()` takes no argument; `TConfig` carries its type. `defineFastifyRoutes` passes the
  group's schema to inline handlers through `NoInfer`, as it does `TUses`. `defineFastifyRoute`
  infers it from an annotated `handle` parameter and defaults it to `null`, in which case
  `getConfig` does not exist. A route annotated with one schema does not typecheck in a group
  declaring another.
- `defineFastifyRoute` stops erasing its return type to bare `GatewayRoute` (`index.ts:215`) and
  returns what it inferred. `TUses` alone stays wide: a lone route has nothing to infer it from,
  and the group's `NoInfer<TUses>` keeps that from widening the group (`index.ts:167`).
- `TConfig` is `Nullable` from tooltool and defaults to `null` (AGENTS.md). The existing schema
  parameters default to `undefined` (`index.ts:131-133`); they are not touched.
- A getter rather than the value, because `start` sees the configuration once
  (`application.ts:481`). `onConfigReload` replaces what the getter returns; a component may
  define both hooks (`packages/stelaro/src/component/types.ts:228,232`). `port` and `host` still
  apply at start only.
- The gateway's own routes have no `getConfig`: they declare no schema, and nothing needs one.
- Mounting a group that declares `config` without `options.getConfig` throws at mount time. The
  types allow it only when bypassed, as with `UnboundCallError`. A group that declares none gets
  no `getConfig` on its handler contexts.
- Two listed schemas with different morphs for one key make `defineFastifyGateway` throw: arktype
  rejects the intersection (`@ark/schema/out/roots/morph.js:36-37`).
- s0008 still holds: component configuration stays scoped to the gateway, because the routes
  that read it are mounted by and run as the gateway.

Tests, in `index.spec.ts`:

- With one listed schema and a mount declaring it, `gateway.config` rejects a value without the
  key and applies the schema's morph; `getConfig()` returns the morphed value.
- A mount declaring a schema the gateway does not list makes `defineFastifyGateway` throw
  `UnlistedConfigError`.
- After `onConfigReload` with a new context, the handler reads the new value and `listen` is
  not called again.
- Mounting a declaring group without `getConfig` throws; a non-declaring group's context has no
  `getConfig`.
- A `defineFastifyRoute` handler annotated with one schema in a group declaring another is a
  type error (`@ts-expect-error`).
- Two mounts declaring the same listed schema both read it; two listed schemas both apply; two
  listed schemas with different morphs for one key make `defineFastifyGateway` throw.

### Spec change (s0016)

Marked `NEEDS APPROVAL` unless the execute instruction approves this text.

Types block: add `GatewayConfigSchema`, `config?` on `FastifyRouteGroup`,
`config?: readonly GatewayConfigSchema[]` on `FastifyGatewayDefinition`, `getConfig()` on
`GatewayHandlerContext`, `getConfig?` on `MountFastifyRoutesOptions`, and
`class UnlistedConfigError extends StelaroError {}`.

Behavior, first bullet, replace

> The gateway receives, but does not create, a `FastifyInstance`; config supplies listen port and
> optional host.

with

> The gateway receives, but does not create, a `FastifyInstance`. Its configuration schema is the
> intersection of the listen settings, `port` and optional `host`, and the schemas listed in
> `config`. Every mount's `config` must be one of them; `defineFastifyGateway` throws
> `UnlistedConfigError` otherwise.

Behavior, new bullet after the `uses` bullet:

> A group's `config` is the schema of the gateway configuration its handlers read. Their
> `getConfig()` returns the current configuration typed by that schema; handlers of a group
> without `config`, and the gateway's own routes, have no `getConfig`. After a configuration
> reload, handlers read the new configuration; the listen settings apply at start only.

Behavior, `mountFastifyRoutes` bullet, replace

> A group that uses components requires `call`, which serves the handlers' calls; a group that
> uses none takes no options.

with

> A group that uses components requires `call`, which serves the handlers' calls; a group that
> declares `config` requires `getConfig`, a function returning the current configuration; a group
> with neither takes no options.

and append to the same bullet

> Mounting a group that declares `config` without `getConfig`, possible only by bypassing the
> types, throws.

## Completion conditions

- [ ] The human has approved the s0016 text above, or replaced it.
- [ ] A mount declaring a listed schema reads its value from the gateway's configuration file;
      declaring an unlisted one fails when the gateway is defined.
- [ ] `pnpm build`, `pnpm lint`, and `pnpm test` pass.
