import type {AnyComponentCalls, ComponentCallFn, ComponentId} from "@jiminp/stelaro";
import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {type} from "arktype";
import type {
    FastifyBaseLogger, FastifyInstance, FastifyTypeProvider, FastifyTypeProviderDefault, RawReplyDefaultExpression, RawRequestDefaultExpression,
    RawServerBase, RawServerDefault,
} from "fastify";

import type {AnyGatewayRoute, FastifyRouteGroup} from "./route.ts";
import {mountFastifyRoutes} from "./route.ts";

type ConfigSchema = type.Any<object>;
const GatewayListenSettings = type({"port": "0 <= number.integer <= 65535", "host?": "string"});
type GatewayListenSettings = typeof GatewayListenSettings.infer;

const DefaultExtraConfig = type({});
type DefaultExtraConfig = typeof DefaultExtraConfig;

type GatewayConfig<TConfigSchema extends ConfigSchema = DefaultExtraConfig> = GatewayListenSettings & TConfigSchema["infer"];
type CompatibleMounts<TConfigSchema extends ConfigSchema> = readonly FastifyRouteGroup<readonly AnyComponentCalls[], TConfigSchema["infer"]>[];

/**
 * Options for {@link defineFastifyGateway}.
 *
 * @typeParam TId - Gateway component ID (default: `ComponentId`)
 * @typeParam TUses - Component call surfaces for `routes` (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfigSchema - Schema for configuration keys beyond `port` and `host` (default: `ConfigSchema`)
 * @typeParam TMounts - Component route groups to mount (default: `CompatibleMounts<TConfigSchema>`)
 * @typeParam TServer - Fastify server type (default: `FastifyInstance`)
 *
 * @category Gateway
 */
export type FastifyGatewayDefinition<
    TId extends ComponentId = ComponentId,
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfigSchema extends ConfigSchema = ConfigSchema,
    TMounts extends CompatibleMounts<TConfigSchema> = CompatibleMounts<TConfigSchema>,
    TServer = FastifyInstance,
> = {
    /** Component ID of the gateway. */
    readonly id: TId;
    /** Caller-configured Fastify server managed by the gateway. */
    readonly server: TServer;
    /** Component call surfaces available to `routes`. */
    readonly uses: TUses;
    /** Schema for configuration keys beyond `port` and `host`. */
    readonly config?: TConfigSchema;
    /** Component route groups to mount on startup. */
    readonly mounts?: TMounts;
    /** Gateway-owned routes for cross-cutting endpoints such as health checks. */
    readonly routes?: readonly AnyGatewayRoute<NoInfer<TUses>, GatewayConfig<TConfigSchema>>[];
};

/**
 * Define a Stelaro component that mounts Fastify routes on start and closes the server on stop.
 *
 * @typeParam TId - Gateway component ID
 * @typeParam TUses - Component call surfaces for `routes`
 * @typeParam TConfigSchema - Schema for configuration keys beyond `port` and `host` (default: `DefaultExtraConfig`)
 * @typeParam TMounts - Component route groups to mount (default: `readonly []`)
 * @typeParam TRawServer - Underlying server type (default: `RawServerDefault`)
 * @typeParam TRawRequest - Underlying request type
 * @typeParam TRawReply - Underlying response type
 * @typeParam TLogger - Fastify logger type (default: `FastifyBaseLogger`)
 * @typeParam TTypeProvider - Fastify type provider (default: `FastifyTypeProviderDefault`)
 * @param definition - Gateway configuration, server instance, and routes
 * @returns A component whose `uses` combines the gateway's and mounts' dependencies
 * @throws {InvalidComponentIdError} `id` is not lowercase kebab-case.
 *
 * @remarks
 * The gateway's configuration file (`config/<id>.toml`) takes `port`, optional `host` (default: `"localhost"`), and any keys matched by `config`.
 * Reloading updates what `getConfig()` returns, while `port` and `host` apply only at startup.
 * Because Fastify servers cannot listen again after closing, an application with a Fastify gateway cannot be restarted after `stop()`.
 *
 * Register plugins, hooks, and error handlers on `server` before starting the application.
 * To route Fastify's access logs through Stelaro's Pino logger, create `server` with `loggerInstance: logger.childPinoLogger(id)`.
 *
 * @example
 * ```typescript
 * import {createApplication} from "@jiminp/stelaro";
 * import {defineFastifyGateway} from "@jiminp/stelaro-fastify";
 * import {type} from "arktype";
 * import fastify from "fastify";
 *
 * // config/web.toml:
 * //   port = 8080
 * //   site_name = "Stelaro"
 * const web = defineFastifyGateway({
 *     id: "web",
 *     server: fastify(),
 *     uses: [],
 *     config: type({site_name: "string"}),
 *     routes: [{method: "GET", path: "/", handle: ({getConfig, html}) => html(`<h1>${getConfig().site_name}</h1>`)}],
 * });
 * const app = createApplication({components: [web]});
 * await app.start();
 * ```
 *
 * @category Gateway
 */
export function defineFastifyGateway<
    const TId extends ComponentId,
    const TUses extends readonly AnyComponentCalls[],
    TConfigSchema extends ConfigSchema = DefaultExtraConfig,
    const TMounts extends CompatibleMounts<TConfigSchema> = readonly [],
    TRawServer extends RawServerBase = RawServerDefault,
    TRawRequest extends RawRequestDefaultExpression<TRawServer> = RawRequestDefaultExpression<TRawServer>,
    TRawReply extends RawReplyDefaultExpression<TRawServer> = RawReplyDefaultExpression<TRawServer>,
    TLogger extends FastifyBaseLogger = FastifyBaseLogger,
    TTypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
>(
    definition: FastifyGatewayDefinition<
        TId, TUses, TConfigSchema, TMounts, FastifyInstance<TRawServer, TRawRequest, TRawReply, TLogger, TTypeProvider>
    >,
) {
    const {id, server, uses, mounts = [], routes = []} = definition;
    const ExtraConfig = (definition.config ?? DefaultExtraConfig) as TConfigSchema;

    type EffectiveUses = readonly (TUses[number] | TMounts[number]["uses"][number])[];
    const effective_uses: EffectiveUses = [
        ...new Set([...uses, ...mounts.flatMap((mount): TMounts[number]["uses"] => mount.uses)]),
    ];

    let active_call: ComponentCallFn<EffectiveUses>;
    let current_config: GatewayConfig<TConfigSchema>;
    const call: ComponentCallFn<EffectiveUses> = (reference, input) => active_call(reference, input);
    const options = {call, getConfig: () => current_config};

    return defineComponent({
        calls: defineComponentCalls(id, {}),
        uses: effective_uses,
        config: GatewayListenSettings.pipe(({port, host, ...extra}): GatewayConfig<TConfigSchema> =>
            // ArkType's .assert() does not throw ArkErrors returned from a morph, so validate with .assert() directly.
            Object.assign({}, ExtraConfig.assert(extra), host == null ? {port} : {port, host}),
        ),
        handlers: {},
        async start(context) {
            active_call = context.call;
            current_config = context.config as GatewayConfig<TConfigSchema>;
            mountFastifyRoutes(server, {uses, routes}, options);
            for(const mount of mounts) {
                mountFastifyRoutes(server, mount, options);
            }
            const {port, host} = current_config;
            const address = await server.listen(host == null ? {port} : {port, host});
            context.log.info("Listening at %s.", address);
        },
        onConfigReload(context) {
            current_config = context.config as GatewayConfig<TConfigSchema>;
        },
        async stop(context) {
            // Rebind to the stop hook's context so in-flight requests can still call dependencies during shutdown.
            active_call = context.call;
            await server.close();
            context.log.info("Server closed.");
        },
    });
}
