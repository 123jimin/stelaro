import type {AnyComponentCalls} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {
    ButtonInteraction,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
} from "discord.js";

import type {BaseHandlerContext} from "./types.ts";

type ParamKeys<P extends string> =
    P extends `${string}{${infer Name}}${infer Rest}`
        ? Name | ParamKeys<Rest>
        : never;

/** Extracts named parameter keys from a colon-delimited `customId` pattern.
 *
 * @typeParam P - Pattern string with `{name}` placeholders
 * @category Interactions
 */
export type InteractionParams<P extends string> =
    [ParamKeys<P>] extends [never]
        ? Record<string, never>
        : {readonly [K in ParamKeys<P>]: string};

/**
 * Context passed to a component interaction handler (buttons, selects, modals).
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TPattern - Colon-delimited `customId` pattern
 * @category Interactions
 */
export type InteractionHandlerContext<
    TUses extends readonly AnyComponentCalls[],
    TPattern extends string = string,
> = BaseHandlerContext<TUses> & {
    /** The button, select menu, or modal submit interaction */
    readonly interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
    /** Extracted parameters from the `customId` pattern */
    readonly params: InteractionParams<TPattern>;
};

/**
 * Defines a handler matched by a colon-delimited `customId` pattern.
 *
 * Pattern segments wrapped in `{braces}` are extracted as named parameters.
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TPattern - Colon-delimited `customId` pattern
 * @category Interactions
 */
export type InteractionDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TPattern extends string = string,
> = {
    /** Colon-delimited pattern to match against `customId` */
    readonly pattern: TPattern;
    /** Handles the matched interaction */
    handle(context: InteractionHandlerContext<TUses, TPattern>): Promisable<void>;
};

/**
 * Creates a type-erased {@link InteractionDefinition} for use in mount groups.
 *
 * @param definition - Interaction definition
 * @returns Type-erased interaction definition
 * @category Interactions
 */
export function interaction<
    TPattern extends string,
>(definition: InteractionDefinition<readonly AnyComponentCalls[], TPattern>): InteractionDefinition {
    return definition as InteractionDefinition;
}

type CompiledPattern = {
    readonly segments: readonly string[];
    readonly param_indices: ReadonlyMap<number, string>;
};

/**
 * Compiles a colon-delimited `customId` pattern into segments and parameter indices.
 *
 * @param pattern - Pattern string with literal segments and `{name}` placeholders
 * @returns Compiled pattern for matching
 */
export function compilePattern(pattern: string): CompiledPattern {
    const segments: string[] = [];
    const param_indices = new Map<number, string>();

    for(const [i, segment] of pattern.split(":").entries()) {
        const match = /^\{(\w+)\}$/.exec(segment);
        if(match != null) {
            segments.push("");
            param_indices.set(i, match[1]!);
        } else {
            segments.push(segment);
        }
    }

    return {segments, param_indices};
}

/**
 * Matches a `customId` against a compiled pattern and extracts parameters.
 *
 * @param compiled - Compiled pattern from {@link compilePattern}
 * @param custom_id - Interaction `customId` to match
 * @returns Extracted parameters, or `null` if the pattern does not match
 */
export function matchPattern(
    compiled: CompiledPattern,
    custom_id: string,
): Record<string, string> | null {
    const parts = custom_id.split(":");

    if(parts.length !== compiled.segments.length) return null;

    const params: Record<string, string> = {};

    for(let i = 0; i < compiled.segments.length; i++) {
        const param_name = compiled.param_indices.get(i);
        if(param_name != null) {
            params[param_name] = parts[i]!;
        } else if(compiled.segments[i] !== parts[i]) {
            return null;
        }
    }

    return params;
}
