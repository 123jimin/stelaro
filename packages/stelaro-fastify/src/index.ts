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

/** `schema`'s validated `value`, or null without a schema; throws {@link RouteValidationError}. */
function validatePart(part: RouteRequestPart, schema: Nullable<ComponentCallSchema>, value: unknown): unknown {
    if(schema == null) return null;
    try {
        return schema.assert(value);
    } catch (err) {
        throw new RouteValidationError(part, err);
    }
}

/** Extracts the output type of a schema, or `null` if the schema is `undefined`. */
export type SchemaOutput<T> = T extends ComponentCallSchema ? T["infer"] : null;

/** @category Routes */
export type GatewayHandlerContext<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TParams = null,
    TBody = null,
    TQuerystring = null,
> = {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly params: TParams;
    readonly body: TBody;
    readonly querystring: TQuerystring;
    call<TCall extends CallFrom<TUses[number]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
    redirect(url: string): void;
    html(content: string): void;
};

/** @category Routes */
export type GatewayRoute<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TParams extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
    TBody extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
    TQuerystring extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
> = Omit<RouteOptions, "method" | "url" | "handler"> & {
    readonly method: HTTPMethods;
    readonly path: string;
    readonly params?: TParams;
    readonly body?: TBody;
    readonly querystring?: TQuerystring;
    handle(context: GatewayHandlerContext<
        TUses,
        SchemaOutput<TParams>,
        SchemaOutput<TBody>,
        SchemaOutput<TQuerystring>
    >): Promisable<unknown>;
};

/** @category Routes */
export type FastifyRouteGroup<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
> = {
    readonly uses: TUses;
    // Inferred from `uses` alone: `route()` erases its routes' uses, which would widen `TUses`.
    readonly routes: readonly GatewayRoute<NoInfer<TUses>>[];
};

/** @category Gateway */
export type FastifyGatewayDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TContributions extends readonly FastifyRouteGroup[] = readonly FastifyRouteGroup[],
> = {
    readonly id: ComponentId;
    readonly server: FastifyInstance;
    readonly uses: TUses;
    readonly mounts?: TContributions;
    readonly routes?: readonly GatewayRoute<TUses>[];
};

/** @category Routes */
export function route<
    TParams extends ComponentCallSchema | undefined = undefined,
    TBody extends ComponentCallSchema | undefined = undefined,
    TQuerystring extends ComponentCallSchema | undefined = undefined,
>(definition: GatewayRoute<readonly AnyComponentCalls[], TParams, TBody, TQuerystring>): GatewayRoute {
    return definition;
}

/** @category Routes */
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
 * @category Routes
 */
export function sendHtml(reply: FastifyReply, content: string): FastifyReply {
    return reply.type(HTML_MEDIA_TYPE).send(content);
}

/** Options for {@link mountFastifyRoutes}.
 *
 * @category Routes
 */
export type MountFastifyRoutesOptions<TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[]> = {
    /** Serves the handlers' `call`. */
    readonly call: GatewayHandlerContext<TUses>["call"];
};

function rejectCall(reference: CallFrom<AnyComponentCalls>): Promise<never> {
    return Promise.reject(new UnboundCallError(reference.component_id, reference.name));
}

/**
 * Mounts `group`'s routes on `server`: validates params, body, and querystring against each
 * route's schemas (throwing {@link RouteValidationError} on failure), then calls its handler with
 * a {@link GatewayHandlerContext}. A group that uses components needs `options.call`; one that
 * uses none takes no options, since its handlers cannot call.
 *
 * @param server - The Fastify instance to mount on
 * @param group - The route group to mount
 * @param options - How the handlers' `call` is served
 * @category Routes
 */
export function mountFastifyRoutes(server: FastifyInstance, group: FastifyRouteGroup<readonly []>): void;
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

/** @category Gateway */
export function defineFastifyGateway<
    const TUses extends readonly AnyComponentCalls[],
    const TContributions extends readonly FastifyRouteGroup[],
>(definition: FastifyGatewayDefinition<TUses, TContributions>) {
    const gateway_calls = defineComponentCalls(definition.id, {});

    const all_uses = [...new Set([
        ...definition.uses,
        ...(definition.mounts ?? []).flatMap((c) => c.uses),
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
