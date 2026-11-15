import type {AnyComponentCalls, ComponentCallFn, ComponentCallSchema} from "@jiminp/stelaro";
import type {Nullable, Promisable} from "@jiminp/tooltool";
import type {
    FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest, FastifyTypeProvider, HTTPMethods, RawReplyDefaultExpression,
    RawRequestDefaultExpression, RawServerBase, RouteOptions,
} from "fastify";

import type {RouteRequestPart} from "./error.ts";
import {RouteValidationError, UnboundCallError, UnboundConfigError} from "./error.ts";
import {sendHtml} from "./response.ts";

/**
 * Request state and helpers passed to a route handler.
 *
 * @typeParam TUses - Component call surfaces available to `call` (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - Configuration type returned by `getConfig` (default: `unknown`)
 * @typeParam TParams - Validated URL parameters (default: `unknown`)
 * @typeParam TBody - Validated request body (default: `unknown`)
 * @typeParam TQuerystring - Validated querystring (default: `unknown`)
 *
 * @remarks
 * Route definitions infer this type automatically.
 * Annotate the handler parameter only when typing `getConfig`.
 *
 * @example
 * ```typescript
 * import type {GatewayHandlerContext} from "@jiminp/stelaro-fastify";
 * import {defineFastifyRoutes} from "@jiminp/stelaro-fastify";
 *
 * type SiteConfig = {site_name: string};
 *
 * const routes = defineFastifyRoutes({
 *     uses: [],
 *     routes: [{
 *         method: "GET",
 *         path: "/",
 *         handle: (ctx: GatewayHandlerContext<readonly [], SiteConfig>) => ctx.getConfig().site_name,
 *     }],
 * });
 * ```
 *
 * @category Gateway
 */
export type GatewayHandlerContext<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfig = unknown,
    TParams = unknown,
    TBody = unknown,
    TQuerystring = unknown,
> = {
    /** Raw Fastify request. */
    readonly request: FastifyRequest;
    /** Raw Fastify reply. */
    readonly reply: FastifyReply;
    /** Validated URL parameters, or `null` when the route has no `params` schema. */
    readonly params: TParams;
    /** Validated request body, or `null` when the route has no `body` schema. */
    readonly body: TBody;
    /** Validated querystring, or `null` when the route has no `querystring` schema. */
    readonly querystring: TQuerystring;
    /** Call function scoped to the route group's `uses`. */
    readonly call: ComponentCallFn<TUses>;

    /**
     * Return the current gateway configuration.
     *
     * @returns Latest validated configuration
     * @throws {UnboundConfigError} The route was mounted without `getConfig`.
     */
    getConfig(): TConfig;

    /**
     * Redirect to `url` with an automatic status code.
     *
     * Sends 308 when permanent, 307 for temporary `GET` and `HEAD` requests, and 303 for other methods.
     *
     * @param url - Destination URL
     * @param is_permanent - Send 308 instead of a temporary redirect (default: `false`)
     */
    redirect(url: string, is_permanent?: boolean): void;

    /**
     * Redirect to `url` with a specific status code.
     *
     * @param url - Destination URL
     * @param status - HTTP redirect status code
     */
    redirect(url: string, status: number): void;

    /**
     * Send an HTML response using {@link HTML_MEDIA_TYPE}.
     *
     * @param content - HTML markup
     */
    html(content: string): void;
};

type RouteSchema = ComponentCallSchema;
type RoutePart<TSchema extends RouteSchema | null> = TSchema extends RouteSchema ? TSchema["infer"] : null;
type SchemaField<TName extends RouteRequestPart, TSchema extends RouteSchema | null> = [TSchema] extends [null]
    ? {readonly [K in TName]?: never}
    : {readonly [K in TName]: TSchema};

type RouteBase<TContext> = Omit<RouteOptions, "method" | "url" | "handler"> & {
    /** HTTP method for the route. */
    readonly method: HTTPMethods;
    /** URL path pattern registered with Fastify. */
    readonly path: string;
    /**
     * Route handler called after request validation.
     *
     * Return a response payload, or send the reply directly and return `undefined`.
     */
    readonly handle: (context: TContext) => Promisable<unknown>;
};

/**
 * A Fastify route definition with optional request schemas.
 *
 * @typeParam TUses - Component call surfaces available to `call` (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - Configuration type returned by `getConfig` (default: `unknown`)
 * @typeParam TParams - URL parameter schema (default: `null`)
 * @typeParam TBody - Request body schema (default: `null`)
 * @typeParam TQuerystring - Querystring schema (default: `null`)
 *
 * @remarks
 * `params`, `body`, and `querystring` validate incoming data before `handle` runs and throw {@link RouteValidationError} on failure.
 * Any other Fastify `RouteOptions` fields (such as hooks, `config`, or `bodyLimit`) are forwarded unchanged.
 *
 * @category Gateway
 */
export type GatewayRoute<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfig = unknown,
    TParams extends RouteSchema | null = null,
    TBody extends RouteSchema | null = null,
    TQuerystring extends RouteSchema | null = null,
> = RouteBase<GatewayHandlerContext<TUses, TConfig, RoutePart<TParams>, RoutePart<TBody>, RoutePart<TQuerystring>>>
    & SchemaField<"params", TParams>
    & SchemaField<"body", TBody>
    & SchemaField<"querystring", TQuerystring>;

// Erase inferred part types to `never` so routes with any schema fit in the same group.
type SchemaRoute<TUses extends readonly AnyComponentCalls[], TConfig> = RouteBase<GatewayHandlerContext<TUses, TConfig, never, never, never>> & (
    | {readonly params: RouteSchema; readonly body?: RouteSchema; readonly querystring?: RouteSchema}
    | {readonly params?: RouteSchema; readonly body: RouteSchema; readonly querystring?: RouteSchema}
    | {readonly params?: RouteSchema; readonly body?: RouteSchema; readonly querystring: RouteSchema}
);

export type AnyGatewayRoute<TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[], TConfig = unknown> =
    | GatewayRoute<TUses, TConfig>
    | SchemaRoute<TUses, TConfig>;

/**
 * A group of Fastify routes and the component calls they use.
 *
 * @typeParam TUses - Component call surfaces available to the group's handlers (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - Configuration type required by the group's handlers (default: `unknown`)
 *
 * @category Gateway
 */
export type FastifyRouteGroup<TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[], TConfig = unknown> = {
    /** Component call surfaces available to handlers in this group. */
    readonly uses: TUses;
    /** Routes belonging to this group. */
    readonly routes: readonly AnyGatewayRoute<TUses, TConfig>[];
};

/**
 * Runtime bindings for {@link mountFastifyRoutes}.
 *
 * @typeParam TUses - Component call surfaces declared by the group (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - Configuration type required by the group (default: `unknown`)
 *
 * @category Gateway
 */
export type MountFastifyRoutesOptions<TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[], TConfig = unknown> = {
    /** Dispatcher for component calls made by handlers in the group. */
    readonly call: ComponentCallFn<TUses>;
} & (unknown extends TConfig ? {
    /** Getter for the configuration returned by `getConfig`. */
    readonly getConfig?: () => TConfig;
} : {
    /** Getter for the configuration returned by `getConfig`. */
    readonly getConfig: () => TConfig;
});

/**
 * Define a single Fastify route with request types inferred from its schemas.
 *
 * @typeParam TUses - Component call surfaces available to `call` (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - Configuration type returned by `getConfig` (default: `unknown`)
 * @typeParam TParams - URL parameter schema (default: `null`)
 * @typeParam TBody - Request body schema (default: `null`)
 * @typeParam TQuerystring - Querystring schema (default: `null`)
 * @param definition - Route definition
 * @returns The route definition with inferred request types
 *
 * @remarks
 * Use this helper when a route declares `params`, `body`, or `querystring` schemas; routes without schemas can be written inline in {@link defineFastifyRoutes}.
 * Because the route is defined outside a group, `call` is not narrowed at compile time, though undeclared calls still fail at runtime with `UndeclaredCallError`.
 *
 * @example
 * ```typescript
 * import {defineFastifyRoute} from "@jiminp/stelaro-fastify";
 * import {type} from "arktype";
 *
 * const route = defineFastifyRoute({
 *     method: "GET",
 *     path: "/threads/:thread_id",
 *     params: type({thread_id: "string"}),
 *     handle: ({params}) => ({thread_id: params.thread_id}),
 * });
 * ```
 *
 * @category Gateway
 */
export function defineFastifyRoute<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfig = unknown,
    TParams extends RouteSchema | null = null,
    TBody extends RouteSchema | null = null,
    TQuerystring extends RouteSchema | null = null,
>(
    definition: GatewayRoute<TUses, TConfig, TParams, TBody, TQuerystring>,
    // Prevent a parent group's contextual type from widening inferred schema parameters.
): GatewayRoute<TUses, TConfig, NoInfer<TParams>, NoInfer<TBody>, NoInfer<TQuerystring>> {
    return definition;
}

/**
 * Define a group of Fastify routes with `call` narrowed to `uses`.
 *
 * @typeParam TUses - Component call surfaces declared in `uses`
 * @typeParam TConfig - Configuration type required by the handlers (default: `unknown`)
 * @param definition - Route group definition
 * @returns The typed route group
 *
 * @example
 * ```typescript
 * import {defineComponentCalls, EmptyInput} from "@jiminp/stelaro";
 * import {defineFastifyRoutes} from "@jiminp/stelaro-fastify";
 * import {type} from "arktype";
 *
 * const health = defineComponentCalls("health", {check: {input: EmptyInput, output: type("boolean")}});
 * const routes = defineFastifyRoutes({
 *     uses: [health],
 *     routes: [{
 *         method: "GET",
 *         path: "/health",
 *         handle: async ({call}) => ({ok: await call(health.calls.check, {})}),
 *     }],
 * });
 * ```
 *
 * @category Gateway
 */
export function defineFastifyRoutes<const TUses extends readonly AnyComponentCalls[], TConfig = unknown>(definition: {
    readonly uses: TUses;
    readonly routes: readonly AnyGatewayRoute<NoInfer<TUses>, TConfig>[];
}): FastifyRouteGroup<TUses, TConfig> {
    return definition;
}

type WideRoute = RouteBase<GatewayHandlerContext> & {
    readonly params?: RouteSchema;
    readonly body?: RouteSchema;
    readonly querystring?: RouteSchema;
};

function validatePart(schema: Nullable<RouteSchema>, value: unknown, part: RouteRequestPart): unknown {
    if(schema == null) {
        return null;
    }
    try {
        return schema.assert(value);
    } catch (cause) {
        throw new RouteValidationError(part, cause);
    }
}

function selectRedirectStatus(method: string, mode: boolean | number | undefined): number {
    if(typeof mode === "number") {
        return mode;
    }
    if(mode === true) {
        return 308;
    }
    // 303 converts non-GET/HEAD redirects into a follow-up GET.
    return method === "GET" || method === "HEAD" ? 307 : 303;
}

const rejectUnboundCall: ComponentCallFn<readonly AnyComponentCalls[]> = async (reference) => {
    throw new UnboundCallError(reference.component_id, reference.name);
};

function rejectUnboundGetConfig(): never {
    throw new UnboundConfigError();
}

function createRouteOptions(route: WideRoute, call: GatewayHandlerContext["call"], getConfig: () => unknown): RouteOptions {
    const {method, path, params, body, querystring, handle, ...options} = route;
    return {
        ...options,
        method,
        url: path,
        async handler(request, reply) {
            const context: GatewayHandlerContext = {
                request,
                reply,
                params: validatePart(params, request.params, "params"),
                body: validatePart(body, request.body, "body"),
                querystring: validatePart(querystring, request.query, "querystring"),
                call,
                getConfig,
                redirect(url: string, mode?: boolean | number) {
                    reply.redirect(url, selectRedirectStatus(request.method, mode));
                },
                html(content) {
                    sendHtml(reply, content);
                },
            };
            return handle(context);
        },
    };
}

/**
 * Register a dependency-free route group on a Fastify server.
 *
 * @typeParam TRawServer - Underlying server type
 * @typeParam TRawRequest - Underlying request type
 * @typeParam TRawReply - Underlying response type
 * @typeParam TLogger - Fastify logger type
 * @typeParam TTypeProvider - Fastify type provider
 * @param server - Fastify server to register routes on
 * @param group - Route group with an empty `uses` list
 *
 * @remarks
 * Useful when mounting routes directly onto a server without {@link defineFastifyGateway}, such as in tests using `server.inject`.
 * Call before `server.listen()`.
 *
 * @category Gateway
 */
export function mountFastifyRoutes<
    TRawServer extends RawServerBase,
    TRawRequest extends RawRequestDefaultExpression<TRawServer>,
    TRawReply extends RawReplyDefaultExpression<TRawServer>,
    TLogger extends FastifyBaseLogger,
    TTypeProvider extends FastifyTypeProvider,
>(server: FastifyInstance<TRawServer, TRawRequest, TRawReply, TLogger, TTypeProvider>, group: FastifyRouteGroup<readonly []>): void;

/**
 * Register a route group on a Fastify server with call and configuration bindings.
 *
 * @typeParam TUses - Component call surfaces declared by the group
 * @typeParam TConfig - Configuration type required by the group
 * @typeParam TRawServer - Underlying server type
 * @typeParam TRawRequest - Underlying request type
 * @typeParam TRawReply - Underlying response type
 * @typeParam TLogger - Fastify logger type
 * @typeParam TTypeProvider - Fastify type provider
 * @param server - Fastify server to register routes on
 * @param group - Route group to register
 * @param options - Call dispatcher and optional configuration getter
 *
 * @remarks
 * Call before `server.listen()`.
 * If `options.getConfig` is omitted, calling `getConfig()` inside a handler throws {@link UnboundConfigError}.
 *
 * @example
 * ```typescript
 * import {createApplication, defineComponent, defineComponentCalls, EmptyInput} from "@jiminp/stelaro";
 * import {defineFastifyRoutes, mountFastifyRoutes} from "@jiminp/stelaro-fastify";
 * import {type} from "arktype";
 * import fastify from "fastify";
 *
 * const health = defineComponentCalls("health", {check: {input: EmptyInput, output: type("boolean")}});
 * const app = createApplication({components: [defineComponent({calls: health, uses: [], handlers: {check: () => true}})]});
 * const server = fastify();
 * mountFastifyRoutes(server, defineFastifyRoutes({
 *     uses: [health],
 *     routes: [{method: "GET", path: "/health", handle: ({call}) => call(health.calls.check, {})}],
 * }), {call: app.call});
 * await app.start();
 * await server.listen({port: 8080});
 * ```
 *
 * @category Gateway
 */
export function mountFastifyRoutes<
    TUses extends readonly AnyComponentCalls[],
    TConfig,
    TRawServer extends RawServerBase,
    TRawRequest extends RawRequestDefaultExpression<TRawServer>,
    TRawReply extends RawReplyDefaultExpression<TRawServer>,
    TLogger extends FastifyBaseLogger,
    TTypeProvider extends FastifyTypeProvider,
>(
    server: FastifyInstance<TRawServer, TRawRequest, TRawReply, TLogger, TTypeProvider>,
    group: FastifyRouteGroup<TUses, TConfig>,
    options: NoInfer<MountFastifyRoutesOptions<TUses, TConfig>>,
): void;

export function mountFastifyRoutes(server: {route(options: never): unknown}, group: FastifyRouteGroup, options?: MountFastifyRoutesOptions): void {
    const call = options?.call ?? rejectUnboundCall;
    const getConfig = options?.getConfig ?? rejectUnboundGetConfig;
    const instance = server as FastifyInstance;
    for(const route of group.routes as readonly WideRoute[]) {
        instance.route(createRouteOptions(route, call, getConfig));
    }
}
