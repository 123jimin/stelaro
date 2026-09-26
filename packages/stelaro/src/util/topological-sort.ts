import {MinHeap} from "./min-heap.ts";

export class TopologicalCycleError<T> extends Error {
    /** Nodes that could not be placed due to the cycle */
    readonly remaining: readonly T[];

    constructor(remaining: readonly T[]) {
        super("Cycle detected: topological sort could not complete.");
        this.name = this.constructor.name;
        this.remaining = remaining;
    }
}

/** Ready nodes are emitted in `nodes` order; dependencies outside `nodes` are ignored. */
export function topologicalSort<T>(
    nodes: readonly T[],
    edges: (node: T) => Iterable<T>,
): T[] {
    const index_of = new Map<T, number>();
    for(let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        if(index_of.has(node)) throw new RangeError(`Duplicate node at index ${i}.`);
        index_of.set(node, i);
    }

    const dependents = new Map<T, T[]>();
    const in_degree = new Map<T, number>();

    for(const node of nodes) {
        dependents.set(node, []);
        in_degree.set(node, 0);
    }

    for(const node of nodes) {
        for(const dependency of edges(node)) {
            if(!index_of.has(dependency)) continue;
            dependents.get(dependency)!.push(node);
            in_degree.set(node, in_degree.get(node)! + 1);
        }
    }

    const queue = new MinHeap<T>((a, b) => index_of.get(a)! - index_of.get(b)!);
    for(const node of nodes) {
        if(in_degree.get(node) === 0) {
            queue.push(node);
        }
    }

    const result: T[] = [];

    while(queue.size > 0) {
        const node = queue.pop() as T;
        result.push(node);

        for(const dependent of dependents.get(node)!) {
            const new_degree = in_degree.get(dependent)! - 1;
            in_degree.set(dependent, new_degree);
            if(new_degree === 0) {
                queue.push(dependent);
            }
        }
    }

    if(result.length < nodes.length) {
        const placed = new Set(result);
        const remaining = nodes.filter((node) => !placed.has(node));
        throw new TopologicalCycleError(remaining);
    }

    return result;
}
