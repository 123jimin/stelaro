/**
 * A discord.js object that may be incomplete and supports fetching its full form.
 *
 * @typeParam TFull - The fully resolved type returned by `fetch()`
 */
export type Partialable<TFull = unknown> = {
    readonly partial: true;
    fetch(): Promise<TFull>;
};

function isPartial<T>(value: T): value is T & Partialable {
    return value != null
        && typeof value === "object"
        && "partial" in value
        && (value as {partial: unknown}).partial === true
        && "fetch" in value
        && typeof (value as {fetch: unknown}).fetch === "function";
}

/**
 * Resolves partial event arguments by calling `fetch()` on any {@link Partialable} argument.
 *
 * @typeParam T - Element type of the arguments array
 * @param args - Raw event arguments
 * @returns Arguments with partials replaced by their fetched counterparts
 */
export async function resolvePartials<T>(args: readonly T[]): Promise<T[]> {
    const resolved: T[] = [];
    for(const arg of args) {
        if(isPartial(arg)) {
            resolved.push(await arg.fetch() as T);
        } else {
            resolved.push(arg);
        }
    }
    return resolved;
}
