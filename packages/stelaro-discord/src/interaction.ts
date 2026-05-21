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

/** @category Interactions */
export type InteractionParams<P extends string> =
    [ParamKeys<P>] extends [never]
        ? Record<string, never>
        : {readonly [K in ParamKeys<P>]: string};

/** @category Interactions */
export type InteractionHandlerContext<
    TUses extends readonly AnyComponentCalls[],
    TPattern extends string = string,
> = BaseHandlerContext<TUses> & {
    readonly interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
    readonly params: InteractionParams<TPattern>;
};

/** @category Interactions */
export type InteractionDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TPattern extends string = string,
> = {
    readonly pattern: TPattern;
    handle(context: InteractionHandlerContext<TUses, TPattern>): Promisable<void>;
};

/** @category Interactions */
export function interaction<
    TPattern extends string,
>(definition: InteractionDefinition<readonly AnyComponentCalls[], TPattern>): InteractionDefinition {
    return definition as InteractionDefinition;
}

type CompiledPattern = {
    readonly segments: readonly string[];
    readonly param_indices: ReadonlyMap<number, string>;
};

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
