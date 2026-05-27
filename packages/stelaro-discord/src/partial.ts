function isPartial(value: unknown): boolean {
    return value != null
        && typeof value === "object"
        && "partial" in value
        && (value as {partial: unknown}).partial === true
        && "fetch" in value
        && typeof (value as {fetch: unknown}).fetch === "function";
}

/**
 * Resolves partial event arguments by calling `fetch()` on any argument
 * that has `partial === true`.
 *
 * @param args - Raw event arguments
 * @returns Arguments with partials replaced by their fetched counterparts
 */
export async function resolvePartials(args: unknown[]): Promise<unknown[]> {
    const resolved: unknown[] = [];
    for(const arg of args) {
        if(isPartial(arg)) {
            resolved.push(await (arg as {fetch(): Promise<unknown>}).fetch());
        } else {
            resolved.push(arg);
        }
    }
    return resolved;
}
