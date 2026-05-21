import type {AnyComponentCalls} from "@jiminp/stelaro";
import type {Promisable} from "@jiminp/tooltool";
import type {ClientEvents} from "discord.js";

import type {BaseHandlerContext} from "./types.ts";

/** @category Events */
export type EventHandlerContext<
    TUses extends readonly AnyComponentCalls[],
    TEvent extends keyof ClientEvents = keyof ClientEvents,
> = BaseHandlerContext<TUses> & {
    readonly event: ClientEvents[TEvent];
};

/** @category Events */
export type EventDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TEvent extends keyof ClientEvents = keyof ClientEvents,
> = {
    readonly type: TEvent;
    handle(context: EventHandlerContext<TUses, TEvent>): Promisable<void>;
};

/** @category Events */
export function event<
    TEvent extends keyof ClientEvents,
>(definition: EventDefinition<readonly AnyComponentCalls[], TEvent>): EventDefinition {
    return definition as EventDefinition;
}
