import {
    type AnyComponentCalls,
    type CallFrom,
    type CallInput,
    type CallOutput,
    type ComponentCallSchema,
    type ComponentId,
    defineComponent,
    defineComponentCalls,
} from "@jiminp/peranto";
import type {Promisable} from "@jiminp/tooltool";
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

type SchemaOutput<T> = T extends ComponentCallSchema ? T["infer"] : null;

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

export type FastifyGatewayDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
> = {
    readonly id: ComponentId;
    readonly server: FastifyInstance;
    readonly uses: TUses;
    readonly routes: readonly GatewayRoute<TUses>[];
};

export function route<
    TParams extends ComponentCallSchema | undefined = undefined,
    TBody extends ComponentCallSchema | undefined = undefined,
    TQuerystring extends ComponentCallSchema | undefined = undefined,
>(definition: GatewayRoute<readonly AnyComponentCalls[], TParams, TBody, TQuerystring>): GatewayRoute {
    return definition;
}

export function defineFastifyGateway<
    const TUses extends readonly AnyComponentCalls[],
>(definition: FastifyGatewayDefinition<TUses>) {
    const gateway_calls = defineComponentCalls({
        id: definition.id,
        calls: {},
    });

    return defineComponent({
        calls: gateway_calls,
        uses: definition.uses,
        config: FastifyGatewayConfig,
        handlers: {},
        async start(context) {
            for(const route_def of definition.routes) {
                const {
                    method, path, handle,
                    params: params_schema,
                    body: body_schema,
                    querystring: querystring_schema,
                    ...fastify_options
                } = route_def;
                definition.server.route({
                    ...fastify_options,
                    method,
                    url: path,
                    async handler(request, reply) {
                        let validated_params: unknown = null;
                        let validated_body: unknown = null;
                        let validated_querystring: unknown = null;
                        try {
                            if(params_schema != null) validated_params = params_schema.assert(request.params);
                            if(body_schema != null) validated_body = body_schema.assert(request.body);
                            if(querystring_schema != null) validated_querystring = querystring_schema.assert(request.query);
                        } catch (error) {
                            return reply.status(400).send({
                                error: error instanceof Error ? error.message : "Validation failed",
                            });
                        }
                        return handle({
                            request,
                            reply,
                            params: validated_params,
                            body: validated_body,
                            querystring: validated_querystring,
                            call(reference, input) {
                                return context.call(reference, input);
                            },
                            redirect(url) {
                                reply.redirect(url);
                            },
                            html(content) {
                                reply.type("text/html").send(content);
                            },
                        });
                    },
                });
            }

            const listen_options: FastifyListenOptions = {port: context.config.port};
            if(context.config.host != null) {
                listen_options.host = context.config.host;
            }
            await definition.server.listen(listen_options);
        },
        async stop() {
            await definition.server.close();
        },
    });
}
