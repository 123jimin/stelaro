import {identity} from "@jiminp/tooltool";
import type {Type} from "arktype";
import {type} from "arktype";

import type {Schema} from "../schema.ts";

/**
 * A schema that describes a call value before and after validation.
 *
 * @category Component
 */
export interface ComponentCallSchema extends Schema {
    /** The input type accepted by the schema. */
    readonly inferIn: unknown;
}

/**
 * A schema that accepts empty plain objects as call inputs.
 *
 * @category Component
 */
export const EmptyInput: Type<Record<string | symbol, never>> = type({"+": "reject"}).narrow((value, ctx) => {
    const prototype: unknown = Object.getPrototypeOf(value);
    const is_plain_object = prototype === Object.prototype || prototype === null;
    return (is_plain_object && Object.getOwnPropertyNames(value).length === 0)
        || ctx.mustBe("a plain object with no own properties, such as {}");
});

/**
 * A schema that describes an in-process value without validating it.
 *
 * @typeParam T - Type of the local value
 *
 * @category Component
 */
export interface LocalSchema<T> extends ComponentCallSchema {
    /** The type of the supplied local value. */
    readonly inferIn: T;

    /** The type of the same value after passthrough. */
    readonly infer: T;
}

const LOCAL_SCHEMA = Symbol("stelaro local schema");

interface MarkedLocalSchema<T> extends LocalSchema<T> {
    readonly [LOCAL_SCHEMA]: true;
}

function createLocalSchema<T>(): MarkedLocalSchema<T> {
    const schema = {assert: identity};
    // Local schemas pass values through and use inference fields only at compile time.
    return Object.defineProperty(schema, LOCAL_SCHEMA, {value: true}) as MarkedLocalSchema<T>;
}

/**
 * Describe an in-process call input that passes through unchanged.
 *
 * @typeParam T - Type of the input value
 * @returns A local input schema
 *
 * @example
 * ```typescript
 * import {defineLocalInput} from "@jiminp/stelaro";
 *
 * const callback = defineLocalInput<() => void>();
 * ```
 *
 * @category Component
 */
export function defineLocalInput<T>(): LocalSchema<T> {
    return createLocalSchema<T>();
}

/**
 * Describe an in-process call output that passes through unchanged.
 *
 * @typeParam T - Type of the output value
 * @returns A local output schema
 *
 * @example
 * ```typescript
 * import {defineLocalOutput} from "@jiminp/stelaro";
 *
 * const signal = defineLocalOutput<AbortSignal>();
 * ```
 *
 * @category Component
 */
export function defineLocalOutput<T>(): LocalSchema<T> {
    return createLocalSchema<T>();
}

/**
 * Check whether a schema came from a local schema factory.
 *
 * @param call_schema - Schema to check
 * @returns Whether the schema is local
 *
 * @category Component
 */
export function isLocalSchema(call_schema: ComponentCallSchema): boolean {
    return Object.hasOwn(call_schema, LOCAL_SCHEMA);
}
