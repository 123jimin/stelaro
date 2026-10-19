export class TopologicalCycleError<T> extends Error {
    /** Nodes that could not be placed due to the cycle */
    readonly remaining: readonly T[];

    constructor(remaining: readonly T[]) {
        super("Cycle detected: topological sort could not complete.");
        this.name = this.constructor.name;
        this.remaining = remaining;
    }
}

/** Depth-first post-order: each node follows its dependencies, otherwise `nodes` order.
 *  Dependencies outside `nodes` are ignored; nodes in or depending on a cycle are `remaining`. */
export function topologicalSort<T>(
    nodes: readonly T[],
    edges: (node: T) => Iterable<T>,
): T[] {
    const known = new Set<T>();
    for(const [i, node] of nodes.entries()) {
        if(known.has(node)) throw new RangeError(`Duplicate node at index ${i}.`);
        known.add(node);
    }

    const state = new Map<T, "visiting" | "placed" | "cyclic">();
    const result: T[] = [];

    // Returns whether `node` was placed. Reaching a node still "visiting" is a cycle; the
    // failure propagates to every node on the path and to later visitors of a cyclic node.
    const visit = (node: T): boolean => {
        const seen = state.get(node);
        if(seen != null) return seen === "placed";
        state.set(node, "visiting");

        let placeable = true;
        for(const dependency of edges(node)) {
            if(known.has(dependency) && !visit(dependency)) placeable = false;
        }

        state.set(node, placeable ? "placed" : "cyclic");
        if(placeable) result.push(node);
        return placeable;
    };

    for(const node of nodes) visit(node);

    if(result.length < nodes.length) {
        throw new TopologicalCycleError(nodes.filter((node) => state.get(node) !== "placed"));
    }
    return result;
}
