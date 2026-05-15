import type {AnyComponentCalls} from "@jiminp/peranto";
import type {Promisable} from "@jiminp/tooltool";
import type {ClientEvents} from "discord.js";

import type {BaseHandlerContext} from "./types.ts";

export type EventHandlerContext<
    TUses extends readonly AnyComponentCalls[],
    TEvent extends keyof ClientEvents = keyof ClientEvents,
> = BaseHandlerContext<TUses> & {
    readonly event: ClientEvents[TEvent];
};

export type EventDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TEvent extends keyof ClientEvents = keyof ClientEvents,
> = {
    readonly type: TEvent;
    handle(context: EventHandlerContext<TUses, TEvent>): Promisable<void>;
};

export function event<
    TEvent extends keyof ClientEvents,
>(definition: EventDefinition<readonly AnyComponentCalls[], TEvent>): EventDefinition {
    return definition as EventDefinition;
}
