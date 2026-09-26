import type {AnyComponentCalls} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {
    ButtonInteraction,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
} from "discord.js";

import type {ConcurrencyOptions} from "./middleware/concurrency.ts";
import type {Guard} from "./middleware/guard.ts";
import type {RateLimitOptions} from "./middleware/rate-limit.ts";
import type {BaseHandlerContext} from "./types.ts";

type SegmentParam<TSegment extends string> = TSegment extends `{${infer Name}}` ? Name : never;

type ParamKeys<P extends string> =
    string extends P ? string
        : P extends `${infer Segment}:${infer Rest}` ? SegmentParam<Segment> | ParamKeys<Rest>
            : SegmentParam<P>;

/**
 * Parameters of a colon-delimited `customId` pattern, keyed by its whole-segment `{name}` placeholders.
 *
 * @typeParam P - Pattern string
 * @category Interactions
 */
export type InteractionParams<P extends string> = {readonly [K in ParamKeys<P>]: string};

/**
 * Context passed to a component interaction handler (buttons, selects, modals).
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TPattern - Colon-delimited `customId` pattern (default: `string`)
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
 * @typeParam TUses - Declared component call surfaces (default: `readonly AnyComponentCalls[]`)
 * @typeParam TPattern - Colon-delimited `customId` pattern (default: `string`)
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
    /** Pre-handler guards executed after gateway and mount guards */
    readonly guards?: readonly Guard[];
    /** Sliding-window rate limit for this interaction handler */
    readonly rate_limit?: RateLimitOptions;
    /** Per-key concurrency limit for this interaction handler */
    readonly concurrency?: ConcurrencyOptions;
};

/**
 * Defines a persistent component interaction handler whose `params` are typed from its pattern.
 *
 * @typeParam TPattern - Colon-delimited `customId` pattern
 * @param definition - Interaction definition
 * @returns `definition`
 *
 * @remarks
 * The handler's `call` accepts any component's reference; the calls it makes are not checked
 * against the enclosing mount's `uses`.
 *
 * @example
 * ```ts
 * const vote = interaction({
 *     pattern: "poll:{poll_id}:vote:{option}",
 *     async handle({interaction, params}) {
 *         await interaction.reply(`Voted ${params.option} in poll ${params.poll_id}.`);
 *     },
 * });
 * ```
 *
 * @category Interactions
 */
export function interaction<
    TPattern extends string,
>(definition: InteractionDefinition<readonly AnyComponentCalls[], TPattern>): InteractionDefinition {
    return definition;
}

export type CompiledPattern = {
    readonly segments: readonly string[];
    readonly param_indices: ReadonlyMap<number, string>;
};

/** Compiles a colon-delimited `customId` pattern, throwing on stray braces, non-word names, or duplicate names. */
export function compilePattern(pattern: string): CompiledPattern {
    const segments: string[] = [];
    const param_indices = new Map<number, string>();
    const param_names = new Set<string>();

    for(const [i, segment] of pattern.split(":").entries()) {
        const name = /^\{(\w+)\}$/.exec(segment)?.[1];
        if(name == null) {
            if(/[{}]/.test(segment)) {
                throw new Error(`Invalid segment "${segment}" in interaction pattern "${pattern}".`);
            }
            segments.push(segment);
            continue;
        }
        if(param_names.has(name)) {
            throw new Error(`Duplicate parameter "${name}" in interaction pattern "${pattern}".`);
        }
        param_names.add(name);
        segments.push("");
        param_indices.set(i, name);
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
