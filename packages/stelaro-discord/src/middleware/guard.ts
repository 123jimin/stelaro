import type {Promisable} from "@jiminp/tooltool";
import type {BaseInteraction, Client} from "discord.js";

/**
 * Context passed to a guard function.
 *
 * @category Middleware
 */
export type GuardContext = {
    /** The interaction being guarded */
    readonly interaction: BaseInteraction;
    /** The Discord.js client instance */
    readonly client: Client;
};

/**
 * Pre-handler check that rejects by throwing `UserFacingError`.
 *
 * Returns to pass, throws to reject. The thrown error is handled by the
 * gateway's error dispatch pipeline. For autocomplete, a guard rejection
 * responds with empty choices instead of an ephemeral reply.
 *
 * @category Middleware
 */
export type Guard = (context: GuardContext) => Promisable<void>;

/**
 * Executes guards sequentially, aborting on the first throw.
 *
 * @param guards - Ordered list of guards to run
 * @param context - Shared guard context
 */
export async function runGuards(guards: readonly Guard[], context: GuardContext): Promise<void> {
    for(const guard of guards) {
        await guard(context);
    }
}
