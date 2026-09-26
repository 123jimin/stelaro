import {
    type AnyComponentCalls,
    type CallFrom,
    type CallInput,
    type CallOutput,
    type ComponentCallSchema,
    type ComponentId,
    defineComponent,
    defineComponentCalls,
    StelaroError,
} from "@jiminp/stelaro";
import type {Nullable, Promisable} from "@jiminp/tooltool";
import {type as schema} from "arktype";
import type {
    FastifyInstance,
    FastifyListenOptions,
    FastifyReply,
    FastifyRequest,
    HTTPMethods,
    RouteOptions,
} from "fastify";

const FastifyGatewayConfig = schema({"port": "number", "host?": "string"});

/**
 * The rejection of a handler's `call` on routes mounted without one. {@link mountFastifyRoutes}
 * requires `call` whenever the group uses a component, so only code bypassing its types sees it.
 *
 * @category Errors
 */
export class UnboundCallError extends StelaroError {
    /** Component id of the called reference */
    readonly component_id: string;
    /** Call name of the called reference */
    readonly call_name: string;

    constructor(component_id: string, call_name: string) {
        super(`Call ${component_id}.${call_name} is unbound: its routes were mounted without \`call\`.`);
        this.component_id = component_id;
        this.call_name = call_name;
    }
}

/** A request part a route validates; named as Fastify names it in `validationContext`.
 *
 * @category Routes
 */
export type RouteRequestPart = "params" | "body" | "querystring";

/**
 * Thrown before a route's handler when a request part fails the route's schema. It carries HTTP
 * status `400`, so the server's error handler answers it; its `cause` is the schema error.
 *
 * @category Errors
 */
export class RouteValidationError extends StelaroError {
    /** HTTP status Fastify's error handling answers with */
    readonly statusCode = 400;
    /** The request part that failed validation, in the field Fastify's own validation errors use */
    readonly validationContext: RouteRequestPart;

    constructor(validation_context: RouteRequestPart, cause: unknown) {
        super(`Invalid ${validation_context}: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.validationContext = validation_context;
        this.cause = cause;
    }
}

function validatePart(part: RouteRequestPart, part_schema: Nullable<ComponentCallSchema>, value: unknown): unknown {
    if(part_schema == null) return null;
    try {
        return part_schema.assert(value);
    } catch (err) {
        throw new RouteValidationError(part, err);
    }
}

/** The validated type of a route's request-part schema, or `null` when the route declares none.
 *
 * @category Routes
 */
export type SchemaOutput<T> = T extends ComponentCallSchema ? T["infer"] : null;

/**
 * The context a route handler receives: the raw Fastify request and reply, the validated request
 * parts, and helpers to call components and send responses.
 *
 * @typeParam TUses - Call surfaces `call` accepts references from (default: `readonly AnyComponentCalls[]`)
 * @typeParam TParams - Validated params (default: `null`)
 * @typeParam TBody - Validated body (default: `null`)
 * @typeParam TQuerystring - Validated querystring (default: `null`)
 *
 * @category Routes
 */
export type GatewayHandlerContext<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TParams = null,
    TBody = null,
    TQuerystring = null,
> = {
    /** The raw Fastify request */
    readonly request: FastifyRequest;
    /** The raw Fastify reply */
    readonly reply: FastifyReply;
    /** Params validated by the route's `params` schema, or `null` without one */
    readonly params: TParams;
    /** Body validated by the route's `body` schema, or `null` without one */
    readonly body: TBody;
    /** Querystring validated by the route's `querystring` schema, or `null` without one */
    readonly querystring: TQuerystring;
    /** Calls a component through a reference from `TUses` */
    call<TCall extends CallFrom<TUses[number]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
    /** Sends a redirect to `url` */
    redirect(url: string): void;
    /** Sends `content` as HTML, as {@link sendHtml} does */
    html(content: string): void;
};

/**
 * A route: its method and path, optional request-part schemas validated before `handle`, and any
 * other Fastify `RouteOptions`, which are forwarded unchanged.
 *
 * @typeParam TUses - Call surfaces the handler's `call` accepts (default: `readonly AnyComponentCalls[]`)
 * @typeParam TParams - Params schema, if any (default: `ComponentCallSchema | undefined`)
 * @typeParam TBody - Body schema, if any (default: `ComponentCallSchema | undefined`)
 * @typeParam TQuerystring - Querystring schema, if any (default: `ComponentCallSchema | undefined`)
 *
 * @category Routes
 */
export type GatewayRoute<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TParams extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
    TBody extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
    TQuerystring extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
> = Omit<RouteOptions, "method" | "url" | "handler"> & {
    /** HTTP method, or methods, the route answers */
    readonly method: HTTPMethods;
    /** URL path in Fastify's syntax, e.g. `/users/:id` */
    readonly path: string;
    /** Schema the request params must satisfy */
    readonly params?: TParams;
    /** Schema the request body must satisfy */
    readonly body?: TBody;
    /** Schema the request querystring must satisfy */
    readonly querystring?: TQuerystring;
    /** Handles a request whose parts passed validation; its result is sent as the reply */
    handle(context: GatewayHandlerContext<
        TUses,
        SchemaOutput<TParams>,
        SchemaOutput<TBody>,
        SchemaOutput<TQuerystring>
    >): Promisable<unknown>;
};

/**
 * A group of routes and the call surfaces their handlers use, typically exported by the component
 * the routes serve.
 *
 * @typeParam TUses - Call surfaces the routes' handlers may call (default: `readonly AnyComponentCalls[]`)
 *
 * @category Routes
 */
export type FastifyRouteGroup<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
> = {
    /** Call surfaces the routes' handlers may call */
    readonly uses: TUses;
    // Inferred from `uses` alone: `route()` erases its routes' uses, which would widen `TUses`.
    /** Routes of the group */
    readonly routes: readonly GatewayRoute<NoInfer<TUses>>[];
};

/**
 * The definition {@link defineFastifyGateway} turns into a gateway component.
 *
 * @typeParam TUses - Call surfaces the gateway's own routes may call (default: `readonly AnyComponentCalls[]`)
 * @typeParam TMounts - Route groups mounted alongside the gateway's own routes (default: `readonly FastifyRouteGroup[]`)
 *
 * @category Gateway
 */
export type FastifyGatewayDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TMounts extends readonly FastifyRouteGroup[] = readonly FastifyRouteGroup[],
> = {
    /** Component id of the gateway */
    readonly id: ComponentId;
    /** The Fastify instance to mount routes on and listen with */
    readonly server: FastifyInstance;
    /** Call surfaces the gateway's own routes may call */
    readonly uses: TUses;
    /** Route groups to mount, typically exported by other components */
    readonly mounts?: TMounts;
    /** The gateway's own routes */
    readonly routes?: readonly GatewayRoute<TUses>[];
};

/**
 * Defines a route whose handler's request parts are inferred from its schemas.
 *
 * @typeParam TParams - Params schema, if any (default: `undefined`)
 * @typeParam TBody - Body schema, if any (default: `undefined`)
 * @typeParam TQuerystring - Querystring schema, if any (default: `undefined`)
 * @param definition - The route
 * @returns `definition`
 *
 * @remarks
 * The handler's `call` accepts any component's reference; the calls it makes are not checked
 * against the enclosing group's `uses`.
 *
 * @category Routes
 */
export function route<
    TParams extends ComponentCallSchema | undefined = undefined,
    TBody extends ComponentCallSchema | undefined = undefined,
    TQuerystring extends ComponentCallSchema | undefined = undefined,
>(definition: GatewayRoute<readonly AnyComponentCalls[], TParams, TBody, TQuerystring>): GatewayRoute {
    return definition;
}

/**
 * Defines a route group, inferring its `uses` so inline handlers' `call` accepts only those
 * surfaces.
 *
 * @typeParam TUses - Call surfaces the routes' handlers may call
 * @param definition - The route group
 * @returns `definition`
 *
 * @category Routes
 */
export function defineFastifyRoutes<
    const TUses extends readonly AnyComponentCalls[],
>(definition: FastifyRouteGroup<TUses>): FastifyRouteGroup<TUses> {
    return definition;
}

/** The media type of the HTML that {@link sendHtml} and {@link GatewayHandlerContext.html} send.
 *
 * @category Routes
 */
export const HTML_MEDIA_TYPE = "text/html; charset=utf-8";

/**
 * Sends `content` as HTML ({@link HTML_MEDIA_TYPE}), as {@link GatewayHandlerContext.html} does.
 *
 * @param reply - The reply to send on
 * @param content - The HTML document or fragment
 * @returns `reply`
 *
 * @category Routes
 */
export function sendHtml(reply: FastifyReply, content: string): FastifyReply {
    return reply.type(HTML_MEDIA_TYPE).send(content);
}

/** Options for {@link mountFastifyRoutes}.
 *
 * @typeParam TUses - Call surfaces the mounted handlers may call (default: `readonly AnyComponentCalls[]`)
 *
 * @category Routes
 */
export type MountFastifyRoutesOptions<TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[]> = {
    /** Serves the handlers' `call` */
    readonly call: GatewayHandlerContext<TUses>["call"];
};

function rejectCall(reference: CallFrom<AnyComponentCalls>): Promise<never> {
    return Promise.reject(new UnboundCallError(reference.component_id, reference.name));
}

/**
 * Mounts a route group that uses no components on `server`, validating each request's params,
 * body, and querystring before calling the handler with a {@link GatewayHandlerContext}.
 *
 * A part failing its schema raises {@link RouteValidationError} to the server's error handling.
 *
 * @param server - The Fastify instance to mount on
 * @param group - The route group to mount, with empty `uses`
 *
 * @example
 * ```ts
 * const server = Fastify();
 * mountFastifyRoutes(server, defineFastifyRoutes({
 *     uses: [],
 *     routes: [{method: "GET", path: "/health", handle: () => ({ok: true})}],
 * }));
 * await server.listen({port: 3000});
 * ```
 *
 * @category Routes
 */
export function mountFastifyRoutes(server: FastifyInstance, group: FastifyRouteGroup<readonly []>): void;
/**
 * Mounts a route group that uses components on `server`, serving its handlers' `call` with
 * `options.call`; validation and handler context are as for a group without `uses`.
 *
 * @typeParam TUses - Call surfaces the group's handlers may call
 * @param server - The Fastify instance to mount on
 * @param group - The route group to mount
 * @param options - How the handlers' `call` is served
 *
 * @example
 * ```ts
 * const server = Fastify();
 * const counter_routes = defineFastifyRoutes({
 *     uses: [CounterCalls],
 *     routes: [{method: "GET", path: "/count", handle: ({call}) => call(CounterCalls.calls.current, {})}],
 * });
 *
 * const web = defineComponent({
 *     calls: defineComponentCalls("web", {}),
 *     uses: [CounterCalls],
 *     handlers: {},
 *     async start(context) {
 *         mountFastifyRoutes(server, counter_routes, {call: context.call});
 *         await server.listen({port: 3000});
 *     },
 * });
 * ```
 *
 * @category Routes
 */
export function mountFastifyRoutes<const TUses extends readonly AnyComponentCalls[]>(
    server: FastifyInstance,
    group: FastifyRouteGroup<TUses>,
    options: MountFastifyRoutesOptions<TUses>,
): void;
export function mountFastifyRoutes(
    server: FastifyInstance,
    group: FastifyRouteGroup,
    options?: MountFastifyRoutesOptions,
): void {
    const call = options?.call ?? rejectCall;
    for(const route_def of group.routes) {
        const {
            method, path, handle,
            params: params_schema,
            body: body_schema,
            querystring: querystring_schema,
            ...fastify_options
        } = route_def;
        server.route({
            ...fastify_options,
            method,
            url: path,
            async handler(request, reply) {
                return handle({
                    request,
                    reply,
                    params: validatePart("params", params_schema, request.params),
                    body: validatePart("body", body_schema, request.body),
                    querystring: validatePart("querystring", querystring_schema, request.query),
                    call,
                    redirect(url) {
                        reply.redirect(url);
                    },
                    html(content) {
                        sendHtml(reply, content);
                    },
                });
            },
        });
    }
}

/**
 * Defines a gateway component that mounts its own routes and every route group in `mounts` on
 * `server` at start, listens on the configured `port` and optional `host`, and closes the server
 * at stop.
 *
 * @typeParam TUses - Call surfaces the gateway's own routes may call
 * @typeParam TMounts - Route groups mounted alongside the gateway's own routes
 * @param definition - The gateway's id, server, `uses`, own routes, and mounts
 * @returns A component whose `uses` is the deduplicated union of the gateway's and the mounts' `uses`
 *
 * @example
 * ```ts
 * const counter_routes = defineFastifyRoutes({
 *     uses: [CounterCalls],
 *     routes: [{method: "GET", path: "/count", handle: ({call}) => call(CounterCalls.calls.current, {})}],
 * });
 *
 * export const web = defineFastifyGateway({
 *     id: "web",
 *     server: Fastify(),
 *     uses: [],
 *     mounts: [counter_routes],
 *     routes: [{method: "GET", path: "/", handle: ({html}) => html("<h1>Hello</h1>")}],
 * });
 * ```
 *
 * @category Gateway
 */
export function defineFastifyGateway<
    const TUses extends readonly AnyComponentCalls[],
    const TMounts extends readonly FastifyRouteGroup[],
>(definition: FastifyGatewayDefinition<TUses, TMounts>) {
    const gateway_calls = defineComponentCalls(definition.id, {});

    const all_uses = [...new Set([
        ...definition.uses,
        ...(definition.mounts ?? []).flatMap((mount) => mount.uses),
    ])];
    const groups: readonly FastifyRouteGroup[] = [
        {uses: definition.uses, routes: definition.routes ?? []},
        ...(definition.mounts ?? []),
    ];

    return defineComponent({
        calls: gateway_calls,
        uses: all_uses,
        config: FastifyGatewayConfig,
        handlers: {},
        async start(context) {
            for(const group of groups) mountFastifyRoutes(definition.server, group, {call: context.call});

            const listen_options: FastifyListenOptions = {port: context.config.port};
            if(context.config.host != null) {
                listen_options.host = context.config.host;
            }
            const address = await definition.server.listen(listen_options);
            context.log.info({event: "gateway.listening", address}, `Gateway listening at ${address}.`);
        },
        async stop(context) {
            await definition.server.close();
            context.log.info({event: "gateway.closed"}, "Gateway server closed.");
        },
    });
}
