import type {AnyComponentCalls} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {ClientEvents} from "discord.js";

import type {BaseHandlerContext} from "./types.ts";

/**
 * Context passed to a Discord gateway event handler.
 *
 * @typeParam TUses - Declared component call surfaces
 * @typeParam TEvent - Discord event name (default: `keyof ClientEvents`)
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
 * @typeParam TUses - Declared component call surfaces (default: `readonly AnyComponentCalls[]`)
 * @typeParam TEvent - Discord event name (default: `keyof ClientEvents`)
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
    /** Resolves partial event arguments before the handler runs */
    readonly fetch_partials?: boolean;
};

/**
 * Defines an event handler whose arguments are typed from the event name.
 *
 * @typeParam TEvent - Discord event name
 * @param definition - Event definition
 * @returns `definition`
 *
 * @remarks
 * The handler's `call` accepts any component's reference; the calls it makes are not checked
 * against the enclosing mount's `uses`.
 *
 * @category Events
 */
export function defineDiscordEvent<
    TEvent extends keyof ClientEvents,
>(definition: EventDefinition<readonly AnyComponentCalls[], TEvent>): EventDefinition {
    return definition;
}
