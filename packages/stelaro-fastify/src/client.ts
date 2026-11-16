import type {AnyComponentCallReference, AnyComponentCalls, CallInput, CallOutput} from "@jiminp/stelaro";

import type {CallEndpointReference} from "./call-endpoint.ts";
import {isErrorBody} from "./call-endpoint.ts";
import {JSON_MEDIA_TYPE} from "./response.ts";

export type {CallEndpointReference, ErrorBody, OutputBody} from "./call-endpoint.ts";
export {getCallPath, isErrorBody} from "./call-endpoint.ts";

/**
 * A function that sends a component call and returns its output.
 *
 * @typeParam TCall - Call reference that determines the input and output types
 * @param args - JSON input as the sole argument (default: `{}` when accepted by the call)
 * @returns The output from the server
 * @throws {CallFailedError} The server responds with a non-OK status or an invalid output body.
 *
 * @category Call Transport
 */
export type CallFunction<TCall extends AnyComponentCallReference> = (
    ...args: Record<never, never> extends CallInput<TCall> ? [input?: CallInput<TCall>] : [input: CallInput<TCall>]
) => Promise<CallOutput<TCall>>;

/**
 * A client that selects an endpoint by call name.
 *
 * @typeParam TCalls - Component call surface
 * @param name - Name of a call on the surface
 * @returns Function that sends the selected call
 *
 * @category Call Transport
 */
export type ComponentClient<TCalls extends AnyComponentCalls> =
    <TName extends keyof TCalls["calls"] & string>(name: TName) => CallFunction<TCalls["calls"][TName]>;

/**
 * A factory that binds an HTTP client to a component ID.
 *
 * @typeParam TCalls - Component call surface supplied by the caller (default: `never`)
 * @param component_id - ID of the component to call
 * @returns Client for the component
 *
 * @category Call Transport
 */
export type ComponentClientFactory = <TCalls extends AnyComponentCalls = never>(component_id: TCalls["id"]) => ComponentClient<TCalls>;

/**
 * Path configuration for browser component clients.
 *
 * @category Call Transport
 */
export type ComponentClientFactoryOptions = {
    /** Build the URL or path for a call endpoint. */
    readonly callPath: (reference: CallEndpointReference) => string;
};

/**
 * An error raised when an HTTP call receives a non-OK response or an invalid output body.
 *
 * @category Errors
 */
export class CallFailedError extends Error {
    /** HTTP status of the response. */
    readonly status: number;

    /** Server's error message, or `null` when the response has no string error. */
    readonly server_message: string | null;

    /**
     * Create an error for a failed HTTP response.
     *
     * @param reference - Identity of the call that failed
     * @param status - HTTP status of the response
     * @param server_message - Message from the response body, if available
     */
    constructor(reference: CallEndpointReference, status: number, server_message: string | null) {
        const message = `Call ${JSON.stringify(`${reference.component_id}.${reference.name}`)} failed (HTTP ${status}).`;
        super(server_message ? `${message} ${server_message}` : message);
        this.name = "CallFailedError";
        this.status = status;
        this.server_message = server_message;
    }
}

/**
 * Create a factory for clients that send component calls as JSON POST requests using `fetch`.
 *
 * @param options - Callback that resolves call endpoints to URLs or paths
 * @returns Factory for clients bound to component IDs
 *
 * @remarks
 * Use the same endpoint paths on the server and client. The client checks for the `output` field and returns its value as received.
 *
 * @example
 * ```typescript
 * import type {health} from "./health-calls.js";
 * import {createComponentClientFactory, getCallPath} from "@jiminp/stelaro-fastify/client";
 *
 * const createClient = createComponentClientFactory({callPath: (ref) => getCallPath("/calls", ref)});
 * const client = createClient<typeof health>("health");
 * const ok = await client("check")();
 * ```
 *
 * @category Call Transport
 */
export function createComponentClientFactory({callPath}: ComponentClientFactoryOptions): ComponentClientFactory {
    return <TCalls extends AnyComponentCalls>(component_id: TCalls["id"]): ComponentClient<TCalls> =>
        <TName extends keyof TCalls["calls"] & string>(name: TName) => async (
            input: unknown = {},
        ): Promise<CallOutput<TCalls["calls"][TName]>> => {
            const reference: CallEndpointReference = {component_id, name};
            const response = await fetch(callPath(reference), {
                method: "POST",
                headers: {"content-type": JSON_MEDIA_TYPE},
                body: JSON.stringify(input),
            });
            const body: unknown = await response.json().catch(() => null);
            if(!response.ok) {
                throw new CallFailedError(reference, response.status, isErrorBody(body) ? body.error : null);
            }

            if(body == null || typeof body !== "object" || !("output" in body)) {
                throw new CallFailedError(reference, response.status, null);
            }

            return body.output as CallOutput<TCalls["calls"][TName]>;
        };
}
