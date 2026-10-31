import {
    type AnyComponentCalls,
    type CallFrom,
    CallInputError,
    type ComponentCallFn,
    type ComponentCallSchema,
    type ComponentId,
    type ConfigSchema,
    defineComponent,
    defineComponentCalls,
    isLocalSchema,
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

import type {ComponentClientFactoryOptions, OutputBody} from "./client.ts";

/** The listen settings, part of every gateway's configuration. */
const ListenConfig = schema({"port": "number", "host?": "string"});

/** The configuration of a gateway without `config`. */
const NoConfig = schema({});

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

/**
 * The rejection of a handler's `getConfig` on routes mounted without one.
 *
 * @category Errors
 */
export class UnboundConfigError extends StelaroError {
    constructor() {
        super("`getConfig` is unbound: its routes were mounted without one.");
    }
}

/** A request part a route validates; named as Fastify names it in `validationContext`.
 *
 * @category Routes
 */
export type RouteRequestPart = "params" | "body" | "querystring";

/**
 * Thrown when a request part fails validation. It carries HTTP status `400`, so the server's error
 * handler answers it; its `cause` is the schema error.
 *
 * @category Errors
 */
export class RouteValidationError extends StelaroError {
    /** HTTP status Fastify's error handling answers with */
    readonly statusCode = 400;
    /** The request part that failed validation, in the field Fastify's own validation errors use */
    readonly validationContext: RouteRequestPart;

    constructor(validation_context: RouteRequestPart, cause: unknown) {
        super(`Invalid ${validation_context}: ${cause instanceof Error ? cause.message : String(cause)}`, {cause});
        this.validationContext = validation_context;
    }
}

/**
 * A route handler can throw this when a resource is not found, and Fastify will respond with a 404.
 *
 * @category Errors
 */
export class NotFoundError extends StelaroError {
    /** HTTP status Fastify's error handling answers with */
    readonly statusCode = 404;

    constructor() {
        super("Not found.");
    }
}

/**
 * Thrown when a call cannot be exposed: its name is not URL-safe, its input or output is a local
 * schema, or its path is not normalized or not under `base`.
 *
 * @category Errors
 */
export class InvalidCallEndpointError extends StelaroError {
    /** Component id of the call */
    readonly component_id: string;
    /** Name of the call */
    readonly call_name: string;

    constructor(component_id: string, call_name: string, reason: string) {
        super(`Call ${component_id}.${call_name} cannot be exposed: ${reason}.`);
        this.component_id = component_id;
        this.call_name = call_name;
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

/** The status {@link GatewayHandlerContext.redirect} sends without an explicit one. */
function redirectStatus(method: string, is_permanent: boolean): number {
    if(is_permanent) return 308;
    return method === "GET" || method === "HEAD" ? 307 : 303;
}

/** The validated type of a route's request-part schema, or `null` when the route declares none.
 *
 * @category Routes
 */
export type SchemaOutput<T> = T extends ComponentCallSchema ? T["infer"] : null;

/**
 * The context a route handler receives: the raw Fastify request and reply, the validated request
 * parts, and helpers to call components, read the gateway's configuration, and send responses.
 *
 * @typeParam TUses - Call surfaces `call` accepts references from (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - The gateway configuration the handler reads (default: `unknown`)
 * @typeParam TParams - Validated params (default: `null`)
 * @typeParam TBody - Validated body (default: `null`)
 * @typeParam TQuerystring - Validated querystring (default: `null`)
 *
 * @category Routes
 */
export type GatewayHandlerContext<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfig = unknown,
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
    readonly call: ComponentCallFn<TUses>;
    /** The gateway's current configuration */
    getConfig(): TConfig;
    /**
     * Sends a redirect to `url`. A permanent redirect sends `308`. A temporary one sends `307` for
     * GET and HEAD requests, and `303` for other methods so that the browser follows up with a GET.
     */
    redirect(url: string, is_permanent?: boolean): void;
    /** Sends a redirect to `url` with `status` */
    redirect(url: string, status: number): void;
    /** Sends `content` as HTML, as {@link sendHtml} does */
    html(content: string): void;
};

/**
 * A route: its method and path, optional request-part schemas validated before `handle`, and any
 * other Fastify `RouteOptions`, which are forwarded unchanged.
 *
 * @typeParam TUses - Call surfaces the handler's `call` accepts (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - The gateway configuration the handler reads (default: `unknown`)
 * @typeParam TParams - Params schema, if any (default: `ComponentCallSchema | undefined`)
 * @typeParam TBody - Body schema, if any (default: `ComponentCallSchema | undefined`)
 * @typeParam TQuerystring - Querystring schema, if any (default: `ComponentCallSchema | undefined`)
 *
 * @category Routes
 */
export interface GatewayRoute<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    in TConfig = unknown,
    TParams extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
    TBody extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
    TQuerystring extends ComponentCallSchema | undefined = ComponentCallSchema | undefined,
> extends Omit<RouteOptions, "method" | "url" | "handler"> {
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
        TConfig,
        SchemaOutput<TParams>,
        SchemaOutput<TBody>,
        SchemaOutput<TQuerystring>
    >): Promisable<unknown>;
}

/**
 * A group of routes and the call surfaces their handlers use, typically exported by the component
 * the routes serve.
 *
 * @typeParam TUses - Call surfaces the routes' handlers may call (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfig - The gateway configuration the handlers read (default: `unknown`)
 *
 * @category Routes
 */
export type FastifyRouteGroup<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfig = unknown,
> = {
    /** Call surfaces the routes' handlers may call */
    readonly uses: TUses;
    /** Routes of the group */
    readonly routes: readonly GatewayRoute<NoInfer<TUses>, TConfig>[];
};

/**
 * The definition {@link defineFastifyGateway} turns into a gateway component.
 *
 * @typeParam TUses - Call surfaces the gateway's own routes may call (default: `readonly AnyComponentCalls[]`)
 * @typeParam TConfigSchema - Schema of the gateway's configuration besides the listen settings (default: an empty object schema)
 * @typeParam TMounts - Route groups mounted alongside the gateway's own routes (default: `readonly FastifyRouteGroup[]`)
 *
 * @category Gateway
 */
export type FastifyGatewayDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfigSchema extends ConfigSchema = typeof NoConfig,
    TMounts extends readonly FastifyRouteGroup<readonly AnyComponentCalls[], TConfigSchema["infer"]>[] = readonly FastifyRouteGroup<readonly AnyComponentCalls[], TConfigSchema["infer"]>[],
> = {
    /** Component id of the gateway */
    readonly id: ComponentId;
    /** The Fastify instance to mount routes on and listen with */
    readonly server: FastifyInstance;
    /** Call surfaces the gateway's own routes may call */
    readonly uses: TUses;
    /** Schema of the gateway's configuration besides the listen settings */
    readonly config?: TConfigSchema;
    /** Route groups to mount, typically exported by other components */
    readonly mounts?: TMounts;
    /** The gateway's own routes */
    readonly routes?: readonly GatewayRoute<TUses, NoInfer<TConfigSchema["infer"]>>[];
};

/**
 * Defines a route whose handler's request parts are inferred from its schemas, and whose gateway
 * configuration is inferred from the context type `handle` is annotated with.
 *
 * @typeParam TConfig - The gateway configuration the handler reads (default: `unknown`)
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
export function defineFastifyRoute<
    TConfig = unknown,
    TParams extends ComponentCallSchema | undefined = undefined,
    TBody extends ComponentCallSchema | undefined = undefined,
    TQuerystring extends ComponentCallSchema | undefined = undefined,
>(
    definition: GatewayRoute<readonly AnyComponentCalls[], TConfig, TParams, TBody, TQuerystring>,
): GatewayRoute<readonly AnyComponentCalls[], TConfig, TParams, TBody, TQuerystring> {
    return definition;
}

/**
 * Defines a route group. Its `uses` is inferred, so inline handlers' `call` accepts only those
 * surfaces. The gateway configuration its routes read is inferred too.
 *
 * @typeParam TUses - Call surfaces the routes' handlers may call
 * @typeParam TConfig - The gateway configuration the handlers read
 * @param definition - The route group
 * @returns `definition`
 *
 * @category Routes
 */
export function defineFastifyRoutes<
    const TUses extends readonly AnyComponentCalls[],
    TConfig = unknown,
>(definition: FastifyRouteGroup<TUses, TConfig>): FastifyRouteGroup<TUses, TConfig> {
    return definition;
}

/** The media type of the HTML that {@link sendHtml} and {@link GatewayHandlerContext.html} send.
 *
 * @category Routes
 */
export const HTML_MEDIA_TYPE = "text/html; charset=utf-8";

/** The media type of JSON replies, such as an `ErrorBody`; Fastify's default for an object reply.
 *
 * @category Routes
 */
export const JSON_MEDIA_TYPE = "application/json; charset=utf-8";

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
 * @typeParam TConfig - The gateway configuration the mounted handlers read (default: `unknown`)
 *
 * @category Routes
 */
export type MountFastifyRoutesOptions<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TConfig = unknown,
> = (TUses extends readonly [] ? {readonly call?: never} : {
    /** Serves the handlers' `call` */
    readonly call: GatewayHandlerContext<TUses>["call"];
}) & {
    /** Serves the handlers' `getConfig` */
    readonly getConfig?: () => TConfig;
};

function rejectCall(reference: CallFrom<AnyComponentCalls>): Promise<never> {
    return Promise.reject(new UnboundCallError(reference.component_id, reference.name));
}

function rejectConfig(): never {
    throw new UnboundConfigError();
}

/**
 * Mounts a route group that uses no components on `server`, validating each request's params,
 * body, and querystring before calling the handler with a {@link GatewayHandlerContext}.
 *
 * A part failing its schema raises {@link RouteValidationError} to the server's error handling.
 *
 * @typeParam TConfig - The gateway configuration the handlers read
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
export function mountFastifyRoutes<TConfig>(server: FastifyInstance, group: FastifyRouteGroup<readonly [], TConfig>): void;
/**
 * Mounts a route group that uses components on `server`, serving its handlers' `call` with
 * `options.call` and their `getConfig` with `options.getConfig`; validation and handler context
 * are as for a group without `uses`.
 *
 * @typeParam TUses - Call surfaces the group's handlers may call
 * @typeParam TConfig - The gateway configuration the handlers read
 * @param server - The Fastify instance to mount on
 * @param group - The route group to mount
 * @param options - How the handlers' `call` and `getConfig` are served
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
export function mountFastifyRoutes<
    const TUses extends readonly AnyComponentCalls[],
    TConfig,
>(
    server: FastifyInstance,
    group: FastifyRouteGroup<TUses, TConfig>,
    options: MountFastifyRoutesOptions<TUses, TConfig>,
): void;
export function mountFastifyRoutes(
    server: FastifyInstance,
    group: FastifyRouteGroup,
    options?: Partial<MountFastifyRoutesOptions>,
): void {
    const call = options?.call ?? rejectCall;
    const getConfig = options?.getConfig ?? rejectConfig;
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
                    getConfig,
                    redirect(url: string, status_or_permanent: number | boolean = false) {
                        reply.redirect(url, typeof status_or_permanent === "number" ? status_or_permanent : redirectStatus(request.method, status_or_permanent));
                    },
                    html(content) {
                        sendHtml(reply, content);
                    },
                });
            },
        });
    }
}

// A call name may be put in a URL path segment unescaped.
const CALL_NAME = /^[A-Za-z0-9_-]+$/u;

// A normalized URL path: `/`-separated non-empty segments of URL-unreserved characters, none `.` or
// `..`. It needs no escaping, URL parsing keeps it, and it has no Fastify route syntax (`:`, `*`).
const NORMALIZED_PATH = /^(?:\/(?!\.{1,2}(?:\/|$))[\w.~-]+)+$/u;

/** Options for {@link createExposeCallsFactory}.
 *
 * @category Calls
 */
export type ExposeCallsFactoryOptions = {
    /**
     * Returns the URL path of a call, which must be normalized like `base`, be under `base`, and
     * match the client's `callPath`
     */
    readonly callPath: ComponentClientFactoryOptions["callPath"];
    /**
     * URL path of the namespace that holds every call, e.g. `/_call`. It must be normalized:
     * `/`-separated non-empty segments of ASCII letters, digits, `-`, `.`, `_`, and `~`, none of
     * them `.` or `..`.
     */
    readonly base: string;
    /** Fastify route `config` of every route, exposed and not-found alike */
    readonly config?: NonNullable<RouteOptions["config"]>;
};

/**
 * `exposeCalls` and the not-found routes of its namespace, as {@link createExposeCallsFactory}
 * creates them.
 *
 * @category Calls
 */
export type ExposeCallsFactory = {
    /**
     * Creates a route group serving every call of `calls` as a JSON `POST` endpoint that replies
     * with an {@link OutputBody}.
     *
     * @typeParam TCalls - The call surface
     * @param calls - The call surface to expose
     * @returns A group using `calls`
     *
     * @throws {InvalidCallEndpointError} If a call name has characters other than ASCII letters,
     *   digits, `_`, and `-`, a call's input or output is a local schema, or a call path is not
     *   normalized or does not lie under `base`
     */
    exposeCalls<const TCalls extends AnyComponentCalls>(calls: TCalls): FastifyRouteGroup<readonly [TCalls]>;
    /** A group answering every `GET` of `base` or a path under it with {@link NotFoundError} */
    readonly not_found_routes: FastifyRouteGroup<readonly []>;
};

/**
 * Creates `exposeCalls`, which exposes component calls over HTTP at the paths `callPath` returns,
 * the server counterpart of `createComponentClientFactory` from `@jiminp/stelaro-fastify/client`.
 *
 * An exposed call passes the request body to the handler's `call`, which validates it once, and
 * replies with the output in an {@link OutputBody}. A failure of the call's own input becomes a
 * {@link RouteValidationError} for `body`, and every other failure propagates unchanged.
 *
 * @param options - Call paths, their namespace, and route `config`
 * @returns `exposeCalls`, and `not_found_routes` claiming every other `GET` under `base`
 * @throws {RangeError} If `base` is not normalized
 *
 * @remarks
 * Mount `not_found_routes` once per namespace, so that the server's error handler, not its
 * not-found handler, answers an unserved `GET` under `base`. Outputs must be JSON values: an
 * `undefined` output is dropped from the {@link OutputBody}, and the client rejects it.
 *
 * @example
 * ```ts
 * const {exposeCalls, not_found_routes} = createExposeCallsFactory({
 *     callPath: (reference) => getCallPath("/_call", reference),
 *     base: "/_call",
 * });
 * mountFastifyRoutes(server, exposeCalls(PublicSiteCalls), {call: context.call});
 * mountFastifyRoutes(server, not_found_routes);
 * ```
 *
 * @category Calls
 */
export function createExposeCallsFactory(options: ExposeCallsFactoryOptions): ExposeCallsFactory {
    const {callPath, base} = options;
    if(!NORMALIZED_PATH.test(base)) {
        throw new RangeError(`base must be a normalized URL path; got ${JSON.stringify(base)}.`);
    }
    const route_options = options.config == null ? {} : {config: options.config};
    const prefix = `${base}/`;

    return {
        exposeCalls<const TCalls extends AnyComponentCalls>(calls: TCalls): FastifyRouteGroup<readonly [TCalls]> {
            return {
                uses: [calls],
                routes: Object.values(calls.calls).map((reference) => {
                    if(!CALL_NAME.test(reference.name)) {
                        throw new InvalidCallEndpointError(reference.component_id, reference.name, "its name is not ASCII letters, digits, `_`, and `-`");
                    }
                    if(isLocalSchema(reference.input) || isLocalSchema(reference.output)) {
                        throw new InvalidCallEndpointError(reference.component_id, reference.name, "its input or output is a local schema");
                    }
                    const path = callPath(reference);
                    if(!NORMALIZED_PATH.test(path)) {
                        throw new InvalidCallEndpointError(reference.component_id, reference.name, `its path ${JSON.stringify(path)} is not normalized`);
                    }
                    if(!path.startsWith(prefix)) {
                        throw new InvalidCallEndpointError(reference.component_id, reference.name, `its path ${JSON.stringify(path)} is not under ${JSON.stringify(base)}`);
                    }
                    return defineFastifyRoute({
                        ...route_options,
                        method: "POST",
                        path,
                        handle: async ({request, call}): Promise<OutputBody> => {
                            try {
                                return {output: await call(reference, request.body)};
                            } catch (err) {
                                // Only this call's input came from the client. A nested call cannot
                                // share its ids: stelaro rejects dependency cycles.
                                if(err instanceof CallInputError && err.component_id === reference.component_id && err.call_name === reference.name) {
                                    throw new RouteValidationError("body", err.cause);
                                }
                                throw err;
                            }
                        },
                    });
                }),
            };
        },
        not_found_routes: {
            uses: [],
            // `${base}/*` does not match `base` itself.
            routes: [base, `${prefix}*`].map((path) => defineFastifyRoute({
                ...route_options,
                method: "GET",
                path,
                handle() { throw new NotFoundError(); },
            })),
        },
    };
}

/**
 * Defines a gateway component that mounts its own routes and every route group in `mounts` on
 * `server` at start, listens on the configured `port` and optional `host`, and closes the server
 * at stop. Its configuration is the listen settings and `config`'s keys; handlers read it through
 * `getConfig` as of the last reload.
 *
 * @typeParam TUses - Call surfaces the gateway's own routes may call
 * @typeParam TConfigSchema - Schema of the gateway's configuration besides the listen settings
 * @typeParam TMounts - Route groups mounted alongside the gateway's own routes
 * @param definition - The gateway's id, server, `uses`, `config`, own routes, and mounts
 * @returns A component whose `uses` is the deduplicated union of the gateway's and the mounts' `uses`
 *
 * @example
 * ```ts
 * const SiteConfig = type({origin: "string"});
 * const counter_routes = defineFastifyRoutes({
 *     uses: [CounterCalls],
 *     routes: [{method: "GET", path: "/count", handle: ({call}) => call(CounterCalls.calls.current, {})}],
 * });
 * const origin_routes = defineFastifyRoutes({
 *     uses: [],
 *     routes: [defineFastifyRoute({
 *         method: "GET",
 *         path: "/origin",
 *         handle: (context: GatewayHandlerContext<readonly [], typeof SiteConfig.infer>) => context.getConfig().origin,
 *     })],
 * });
 *
 * export const web = defineFastifyGateway({
 *     id: "web",
 *     server: Fastify(),
 *     uses: [],
 *     config: SiteConfig,
 *     mounts: [counter_routes, origin_routes],
 *     routes: [{method: "GET", path: "/", handle: ({html}) => html("<h1>Hello</h1>")}],
 * });
 * ```
 *
 * @category Gateway
 */
export function defineFastifyGateway<
    const TUses extends readonly AnyComponentCalls[],
    TConfigSchema extends ConfigSchema = typeof NoConfig,
    const TMounts extends readonly FastifyRouteGroup<readonly AnyComponentCalls[], TConfigSchema["infer"]>[] = readonly FastifyRouteGroup<readonly AnyComponentCalls[], TConfigSchema["infer"]>[],
>(definition: FastifyGatewayDefinition<TUses, TConfigSchema, TMounts>) {
    const gateway_calls = defineComponentCalls(definition.id, {});
    const ExtraConfig: ConfigSchema = definition.config ?? NoConfig;
    const GatewayConfig = ListenConfig.pipe(({port, host, ...extra}) => Object.assign({}, ExtraConfig.assert(extra), host == null ? {port} : {port, host}));

    const all_uses = [...new Set([
        ...definition.uses,
        ...(definition.mounts ?? []).flatMap((mount) => mount.uses),
    ])];
    const groups: readonly FastifyRouteGroup<readonly AnyComponentCalls[], TConfigSchema["infer"]>[] = [
        {uses: definition.uses, routes: definition.routes ?? []},
        ...(definition.mounts ?? []),
    ];

    let current: typeof GatewayConfig.infer;

    return defineComponent({
        calls: gateway_calls,
        uses: all_uses,
        config: GatewayConfig,
        handlers: {},
        async start(context) {
            current = context.config;
            // `GatewayConfig` includes `TConfigSchema`'s output.
            const getConfig = () => current as TConfigSchema["infer"];
            for(const group of groups) mountFastifyRoutes(definition.server, group, {call: context.call, getConfig});

            const listen_options: FastifyListenOptions = {port: context.config.port};
            if(context.config.host != null) {
                listen_options.host = context.config.host;
            }
            const address = await definition.server.listen(listen_options);
            context.log.info({event: "gateway.listening", address}, `Gateway listening at ${address}.`);
        },
        onConfigReload(context) {
            current = context.config;
        },
        async stop(context) {
            await definition.server.close();
            context.log.info({event: "gateway.closed"}, "Gateway server closed.");
        },
    });
}
