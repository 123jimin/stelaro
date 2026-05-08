import {
    type AnyComponentCalls,
    type CallFrom,
    type CallInput,
    type CallOutput,
    type ComponentId,
    defineComponent,
    defineComponentCalls,
} from "@jiminp/peranto";
import type {Promisable} from "@jiminp/tooltool";
import {type as schema} from "arktype";
import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
    HTTPMethods,
    RouteGenericInterface,
    RouteOptions,
} from "fastify";

const FastifyGatewayConfig = schema({port: "number"});

export type GatewayHandlerContext<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    Route extends RouteGenericInterface = RouteGenericInterface,
> = {
    readonly request: FastifyRequest<Route>;
    readonly reply: FastifyReply<Route>;
    call<TCall extends CallFrom<TUses[number]>>(
        reference: TCall,
        input: CallInput<TCall>,
    ): Promise<CallOutput<TCall>>;
    redirect(url: string): void;
};

export type GatewayRoute<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    Route extends RouteGenericInterface = RouteGenericInterface,
> = Omit<RouteOptions, "method" | "url" | "handler"> & {
    readonly method: HTTPMethods;
    readonly path: string;
    handle(context: GatewayHandlerContext<TUses, Route>): Promisable<unknown>;
};

export type FastifyGatewayDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
> = {
    readonly id: ComponentId;
    readonly server: FastifyInstance;
    readonly uses: TUses;
    readonly routes: readonly GatewayRoute<TUses>[];
};

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
            for(const route of definition.routes) {
                const {method, path, handle, ...fastify_options} = route;
                definition.server.route({
                    ...fastify_options,
                    method,
                    url: path,
                    async handler(request, reply) {
                        return handle({
                            request,
                            reply,
                            call(reference, input) {
                                return context.call(reference, input);
                            },
                            redirect(url) {
                                reply.redirect(url);
                            },
                        });
                    },
                });
            }

            await definition.server.listen({port: context.config.port});
        },
        async stop() {
            await definition.server.close();
        },
    });
}
