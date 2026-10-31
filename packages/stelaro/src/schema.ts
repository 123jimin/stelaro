import {type as schema} from "arktype";

import type {ComponentCallSchema} from "./component/types.ts";

/**
 * Minimal ArkType-compatible schema contract for runtime validation.
 *
 * @category Utility
 */
export interface Schema {
    /** Validated output type */
    readonly infer: unknown;
    /** Validates input and returns the typed result, or throws on failure */
    assert(input: unknown): this["infer"];
}

/**
 * The input schema for a call that takes no arguments. It accepts only plain objects without own
 * enumerable keys, such as `{}`, and rejects everything else, arrays included.
 *
 * @category Component
 */
export const EmptyInput = schema({"+": "reject"})
    .narrow((value, ctx) => Object.getPrototypeOf(value) === Object.prototype || ctx.mustBe("a plain object"));

/**
 * A call schema for values of type `T` that never leave the process. Its `assert` returns its
 * input unchecked.
 *
 * @typeParam T - Type of the value
 * @category Component
 */
export interface LocalSchema<T> extends ComponentCallSchema {
    readonly infer: T;
    readonly inferIn: T;
}

const LOCAL_SCHEMA = Symbol("local schema");

interface MarkedLocalSchema<T> extends LocalSchema<T> {
    readonly [LOCAL_SCHEMA]: true;
}

function passThrough(input: unknown): unknown {
    return input;
}

function createLocalSchema<T>(): LocalSchema<T> {
    return {assert: passThrough, [LOCAL_SCHEMA]: true} as MarkedLocalSchema<T>;
}

/**
 * Defines the input schema of a call that takes a value which never leaves the process, such as a
 * callback.
 *
 * @typeParam T - Type of the input
 * @category Component
 */
export function defineLocalInput<T>(): LocalSchema<T> {
    return createLocalSchema<T>();
}

/**
 * Defines the output schema of a call that returns a value which never leaves the process, such
 * as a connection pool.
 *
 * @typeParam T - Type of the output
 * @category Component
 */
export function defineLocalOutput<T>(): LocalSchema<T> {
    return createLocalSchema<T>();
}

/**
 * Tells whether `call_schema` came from {@link defineLocalInput} or {@link defineLocalOutput}.
 *
 * @category Component
 */
export function isLocalSchema(call_schema: ComponentCallSchema): boolean {
    return Object.hasOwn(call_schema, LOCAL_SCHEMA);
}
