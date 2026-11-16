import type {ComponentCallName, ComponentId} from "@jiminp/stelaro";

/**
 * The component and call name that identify an HTTP call endpoint.
 *
 * @category Call Transport
 */
export type CallEndpointReference = {
    /** ID of the component that declares the call. */
    readonly component_id: ComponentId;
    /** Name of the call within the component. */
    readonly name: ComponentCallName;
};

/**
 * Join the base, component ID, and call name verbatim to form a call URL.
 *
 * @param base - Base URL or path
 * @param reference - Endpoint identity
 * @returns URL or path for the call
 *
 * @category Call Transport
 */
export function getCallPath(base: string, reference: CallEndpointReference): string {
    return `${base}/${reference.component_id}/${reference.name}`;
}

/**
 * The JSON body returned by a successful HTTP call.
 *
 * @typeParam T - Output value (default: `unknown`)
 *
 * @category Call Transport
 */
export type OutputBody<T = unknown> = {
    /** Output of the component call. */
    readonly output: T;
};

/**
 * The JSON body an application's error handler can send for a failed HTTP call.
 *
 * @category Call Transport
 */
export type ErrorBody = {
    /** Server's message for the failure. */
    readonly error: string;
};

/**
 * Check whether a response body contains a string error message.
 *
 * @param body - Parsed response body
 * @returns Whether the body has a string `error` property
 *
 * @category Call Transport
 */
export function isErrorBody(body: unknown): body is ErrorBody {
    return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string";
}
