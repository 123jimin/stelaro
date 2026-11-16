import type {AnyComponentCalls} from "@jiminp/stelaro";
import {CallInputError, isLocalSchema} from "@jiminp/stelaro";
import type {FastifyContextConfig} from "fastify";

import type {CallEndpointReference, OutputBody} from "./call-endpoint.ts";
import {InvalidCallEndpointError, NotFoundError, RouteValidationError} from "./error.ts";
import type {FastifyRouteGroup, GatewayRoute} from "./route.ts";

/**
 * Path and route configuration for exposing component calls over HTTP.
 *
 * @category Call Transport
 */
export type ExposeCallsFactoryOptions = {
    /** Build the path for a call endpoint. */
    readonly callPath: (reference: CallEndpointReference) => string;
    /** Base path under which all call endpoints are mounted. */
    readonly base: string;
    /** Fastify route configuration applied to every generated route. */
    readonly config?: FastifyContextConfig;
};

/**
 * A factory for HTTP call routes and the GET fallback for their base path.
 *
 * @category Call Transport
 */
export type ExposeCallsFactory = {
    /**
     * Create a JSON POST route for each call on a surface.
     *
     * @param calls - Component call surface to expose
     * @returns Route group that uses the supplied component call surface
     * @throws {InvalidCallEndpointError} A call has an invalid name, a path outside the base, or a local schema.
     */
    exposeCalls(calls: AnyComponentCalls): FastifyRouteGroup;
    /** Routes that throw {@link NotFoundError} for GET requests at or under the base path. */
    readonly not_found_routes: FastifyRouteGroup<readonly []>;
};

/**
 * Create a factory for mounting component calls as JSON POST endpoints.
 *
 * @param options - Base path, endpoint path builder, and optional route configuration
 * @returns Factory for component route groups and the GET fallback group
 *
 * @example
 * ```typescript
 * import {defineComponentCalls, EmptyInput} from "@jiminp/stelaro";
 * import {createExposeCallsFactory} from "@jiminp/stelaro-fastify";
 * import {getCallPath} from "@jiminp/stelaro-fastify/client";
 * import {type} from "arktype";
 *
 * const health = defineComponentCalls("health", {check: {input: EmptyInput, output: type("boolean")}});
 * const base = "/calls";
 * const {exposeCalls, not_found_routes} = createExposeCallsFactory({base, callPath: (ref) => getCallPath(base, ref)});
 * const mounts = [exposeCalls(health), not_found_routes];
 * ```
 *
 * @category Call Transport
 */
export function createExposeCallsFactory(options: ExposeCallsFactoryOptions): ExposeCallsFactory {
    const {base, callPath, config} = options;
    const route_options = config == null ? {} : {config};
    const not_found_routes: FastifyRouteGroup<readonly []> = {
        uses: [],
        routes: [base, `${base}/*`].map((path) => ({
            ...route_options,
            method: "GET",
            path,
            handle() {
                throw new NotFoundError();
            },
        })),
    };

    return {
        exposeCalls(calls) {
            const routes = Object.values(calls.calls).map((reference): GatewayRoute => {
                const {component_id, name, input, output} = reference;
                if(name.length === 0 || /[^A-Za-z0-9_-]/u.test(name)) {
                    throw new InvalidCallEndpointError(component_id, name, "Call names must use ASCII letters, digits, underscores, or hyphens.");
                }
                if(isLocalSchema(input) || isLocalSchema(output)) {
                    throw new InvalidCallEndpointError(component_id, name, "Call input and output schemas must support transport.");
                }
                const path = callPath(reference);
                if(!path.startsWith(`${base}/`)) {
                    throw new InvalidCallEndpointError(component_id, name, `The endpoint path must be under ${JSON.stringify(base)}.`);
                }

                return {
                    ...route_options,
                    method: "POST",
                    path,
                    async handle({call, request}): Promise<OutputBody> {
                        try {
                            return {output: await call(reference, request.body)};
                        } catch (error) {
                            if(error instanceof CallInputError && error.component_id === component_id && error.call_name === name) {
                                throw new RouteValidationError("body", error.cause);
                            }
                            throw error;
                        }
                    },
                };
            });
            return {uses: [calls], routes};
        },
        not_found_routes,
    };
}
