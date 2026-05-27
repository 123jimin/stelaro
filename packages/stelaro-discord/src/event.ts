import type {AnyComponentCalls} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {ClientEvents} from "discord.js";

import type {BaseHandlerContext} from "./types.ts";

/**
 * Context passed to a Discord gateway event handler.
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TEvent - Discord event name
 * @category Events
 */
export type EventHandlerContext<
    TUses extends readonly AnyComponentCalls[],
    TEvent extends keyof ClientEvents = keyof ClientEvents,
> = BaseHandlerContext<TUses> & {
    /** Event arguments from Discord.js */
    readonly event: ClientEvents[TEvent];
};

/**
 * Defines a handler for a Discord gateway event.
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TEvent - Discord event name
 * @category Events
 */
export type EventDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TEvent extends keyof ClientEvents = keyof ClientEvents,
> = {
    /** Discord event name to listen for */
    readonly type: TEvent;
    /** Handles the event */
    handle(context: EventHandlerContext<TUses, TEvent>): Promisable<void>;
};

/**
 * Creates a type-erased {@link EventDefinition} for use in mount groups.
 *
 * @param definition - Event definition
 * @returns Type-erased event definition
 * @category Events
 */
export function event<
    TEvent extends keyof ClientEvents,
>(definition: EventDefinition<readonly AnyComponentCalls[], TEvent>): EventDefinition {
    return definition as EventDefinition;
}
