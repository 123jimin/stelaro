import type {AnyComponentCalls, CallFrom, CallInput} from "@jiminp/stelaro";
import {hasSchemaMorph, isLocalSchema, MorphValidationDisabledError} from "@jiminp/stelaro";
import type {FastifyContextConfig} from "fastify";

import type {CallEndpointReference, OutputBody} from "./call-endpoint.ts";
import {InvalidCallEndpointError, NotFoundError} from "./error.ts";
import type {FastifyRouteGroup} from "./route.ts";
import {defineFastifyRoute} from "./route.ts";

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
    /** Whether to validate call outputs at the HTTP boundary, defaulting to `false`. */
    readonly validate_call_output?: boolean;
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
     * @typeParam TCalls - Component call surface used by the generated routes
     * @param calls - Component call surface to expose
     * @returns Route group that uses the supplied component call surface
     * @throws {InvalidCallEndpointError} A call has an invalid name, a path outside the base, or a local schema.
     */
    exposeCalls<TCalls extends AnyComponentCalls>(calls: TCalls): FastifyRouteGroup<readonly [TCalls]>;
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
    const {base, callPath, config, validate_call_output = false} = options;
    const route_options = config == null ? {} : {config};
    const not_found_routes: FastifyRouteGroup<readonly []> = {
        uses: [],
        routes: [base, `${base}/*`].map((path) => defineFastifyRoute<readonly []>({
            ...route_options,
            method: "GET",
            path,
            handle() {
                throw new NotFoundError();
            },
        })),
    };

    return {
        exposeCalls<TCalls extends AnyComponentCalls>(calls: TCalls) {
            const references = Object.values(calls.calls) as CallFrom<TCalls>[];
            const routes = references.map((reference) => {
                const {component_id, name, input, output} = reference;
                if(name.length === 0 || /[^A-Za-z0-9_-]/u.test(name)) {
                    throw new InvalidCallEndpointError(component_id, name, "Call names must use ASCII letters, digits, underscores, or hyphens.");
                }
                if(isLocalSchema(input) || isLocalSchema(output)) {
                    throw new InvalidCallEndpointError(component_id, name, "Call input and output schemas must support transport.");
                }
                if(!validate_call_output && hasSchemaMorph(output)) {
                    throw new MorphValidationDisabledError(component_id, name, "output");
                }
                const path = callPath(reference);
                if(!path.startsWith(`${base}/`)) {
                    throw new InvalidCallEndpointError(component_id, name, `The endpoint path must be under ${JSON.stringify(base)}.`);
                }

                return defineFastifyRoute<readonly [TCalls], unknown, null, typeof input>({
                    ...route_options,
                    method: "POST",
                    path,
                    body: input,
                    async handle({call, request}): Promise<OutputBody> {
                        // `body: input` validated `request.body`; pass `request.body` because `call` expects pre-morph `CallInput`.
                        const result = await call(reference, request.body as CallInput<typeof reference>);
                        return {output: validate_call_output ? output.assert(result) : result};
                    },
                });
            });
            return {uses: [calls], routes};
        },
        not_found_routes,
    };
}
