// Browser entry: it must not load Fastify or stelaro at runtime, so stelaro imports stay type-only.
import type {
    AnyComponentCallReference,
    AnyComponentCalls,
    CallInput,
    CallOutput,
    ComponentCallName,
    ComponentId,
} from "@jiminp/stelaro";

/** One component call, identified by component id and call name.
 *
 * @category Calls
 */
export type CallEndpointReference = {
    /** Component id of the call */
    readonly component_id: ComponentId;
    /** Name of the call */
    readonly name: ComponentCallName;
};

/**
 * Returns the URL path `${base}/${component_id}/${name}` of a call, a `callPath` for
 * {@link createComponentClientFactory} and the server's `createExposeCallsFactory`.
 *
 * @param base - URL path of the namespace that holds every call, without a trailing slash
 * @param reference - The call
 * @returns The call's URL path
 *
 * @remarks
 * Neither part is escaped. Component ids are kebab-case, and the server rejects call names that
 * are not URL-safe.
 *
 * @example
 * ```ts
 * const callPath = (reference: CallEndpointReference) => getCallPath("/_call", reference);
 * ```
 *
 * @category Calls
 */
export function getCallPath(base: string, reference: CallEndpointReference): string {
    return `${base}/${reference.component_id}/${reference.name}`;
}

/** The JSON body of a successful call's response, carrying the call's output.
 *
 * @typeParam T - The output's type (default: `unknown`)
 *
 * @category Calls
 */
export type OutputBody<T = unknown> = {
    /** The call's output */
    readonly output: T;
};

/** The JSON body of an error response, carrying a message the client may show.
 *
 * @remarks
 * The server's error handler must send it. Fastify's default error reply also has a string
 * `error`, but that is the status's reason phrase, such as `Bad Request`.
 *
 * @category Calls
 */
export type ErrorBody = {
    /** The message */
    readonly error: string;
};

/**
 * Tests whether `body` is an {@link ErrorBody}.
 *
 * @param body - A parsed JSON response body
 * @returns `true` if `body` has a string `error`
 *
 * @category Calls
 */
export function isErrorBody(body: unknown): body is ErrorBody {
    return body != null && typeof body === "object" && "error" in body && typeof body.error === "string";
}

/**
 * A function invoking one call over HTTP. An omitted `input` is sent as `{}`, so it is optional
 * only when the call accepts `{}`; an explicit `null` is sent as `null`.
 *
 * @typeParam TCall - The call's reference
 *
 * @category Calls
 */
export type CallFunction<TCall extends AnyComponentCallReference> = (
    ...args: Record<never, never> extends CallInput<TCall> ? [input?: CallInput<TCall>] : [input: CallInput<TCall>]
) => Promise<CallOutput<TCall>>;

/**
 * A function selecting one of a component's calls by name, returning its {@link CallFunction}.
 *
 * @typeParam TCalls - The component's call surface
 *
 * @category Calls
 */
export type ComponentClient<TCalls extends AnyComponentCalls> = <
    TName extends keyof TCalls["calls"] & string,
>(name: TName) => CallFunction<TCalls["calls"][TName]>;

/**
 * A function creating a {@link ComponentClient} for the component `component_id`. `TCalls` must be
 * given explicitly.
 *
 * @typeParam TCalls - The component's call surface
 *
 * @category Calls
 */
export type ComponentClientFactory = <TCalls extends AnyComponentCalls = never>(component_id: TCalls["id"]) => ComponentClient<TCalls>;

/** Options for {@link createComponentClientFactory}.
 *
 * @category Calls
 */
export type ComponentClientFactoryOptions = {
    /** Returns the URL path of a call, which must match the server's `callPath` */
    readonly callPath: (reference: CallEndpointReference) => string;
};

/**
 * The rejection of a call answered with a non-OK HTTP status, or with a body that is not an
 * {@link OutputBody}.
 *
 * @category Errors
 */
export class CallFailedError extends Error {
    /** HTTP status of the response */
    readonly status: number;
    /** The `error` of a non-OK response's {@link ErrorBody}, otherwise `null` */
    readonly server_message: string | null;

    constructor(reference: CallEndpointReference, status: number, server_message: string | null) {
        super(`Call ${reference.component_id}.${reference.name} failed: ${status}${server_message == null ? "" : ` ${server_message}`}`);
        this.name = "CallFailedError";
        this.status = status;
        this.server_message = server_message;
    }
}

async function getResponseErrorBody(response: Response): Promise<ErrorBody | null> {
    try {
        const body: unknown = await response.json();
        return isErrorBody(body) ? body : null;
    } catch{
        return null;
    }
}

/**
 * Creates a {@link ComponentClientFactory} whose clients invoke calls over HTTP, as the browser
 * counterpart of a component's in-process `call`.
 *
 * Each call `POST`s its input as JSON to `callPath` and resolves to the `output` of the response's
 * {@link OutputBody}. Any other response rejects with {@link CallFailedError}.
 *
 * @param options - How call URLs are built
 * @returns A factory creating one client per component
 *
 * @remarks
 * The output is not validated against the call's output schema; the server validated it.
 *
 * @example
 * ```ts
 * const createComponentClient = createComponentClientFactory({
 *     callPath: (reference) => getCallPath("/_call", reference),
 * });
 * const site = createComponentClient<typeof PublicSiteCalls>(PublicSiteCalls.id);
 * const info = await site("getInfo")();
 * ```
 *
 * @category Calls
 */
export function createComponentClientFactory(options: ComponentClientFactoryOptions): ComponentClientFactory {
    const {callPath} = options;

    async function transport(reference: CallEndpointReference, input: unknown = {}): Promise<unknown> {
        const response = await fetch(callPath(reference), {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(input),
        });
        if(!response.ok) throw new CallFailedError(reference, response.status, (await getResponseErrorBody(response))?.error ?? null);
        const body: unknown = await response.json().catch(() => null);
        if(body == null || typeof body !== "object" || !("output" in body)) throw new CallFailedError(reference, response.status, null);
        return body.output;
    }

    return <TCalls extends AnyComponentCalls = never>(component_id: TCalls["id"]): ComponentClient<TCalls> =>
        <TName extends keyof TCalls["calls"] & string>(name: TName): CallFunction<TCalls["calls"][TName]> => {
            const reference = {component_id, name};
            return (input?: CallInput<TCalls["calls"][TName]>) =>
                transport(reference, input) as Promise<CallOutput<TCalls["calls"][TName]>>;
        };
}
