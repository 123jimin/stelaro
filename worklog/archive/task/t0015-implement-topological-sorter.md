+++
id = "t0015"
title = "Implement topological sorter for component dependency graph"
status = "done"
tags = ["application", "lifecycle"]
modifies = ["s0002"]
blocked_by = []
+++

## Scope

- Implement a generic topological sort utility.
- Input: an array of nodes and a way to derive edges (e.g. a function that returns dependencies for a given node).
- Output: the same nodes in topological order (dependencies before dependents).
- Insertion order as tiebreaker for unrelated nodes.
- Throw on cycles (caller provides or receives enough info to construct a domain-specific error).
- Algorithm: Kahn's algorithm (BFS with in-degree tracking).
- First consumer: `createApplication` maps the component `uses` graph onto this utility to determine lifecycle hook ordering (t0006).

## API

File: `packages/peranto/src/util/topological-sort.ts`

```ts
export class TopologicalCycleError<T> extends Error {
    readonly remaining: readonly T[];
    constructor(remaining: readonly T[]);
}

export function topologicalSort<T>(
    nodes: readonly T[],
    edges: (node: T) => Iterable<T>,
): T[];
```

- `nodes` — input array. Insertion order is preserved as tiebreaker.
- `edges(node)` — returns the dependencies of `node` (nodes that must come *before* it). Only nodes present in `nodes` are considered; references to unknown nodes are ignored.
- Returns `T[]` in dependency-first order.
- Throws `TopologicalCycleError<T>` on cycle. `remaining` carries the nodes that could not be placed (the cycle participants and their downstream dependents). Callers catch and rethrow as their domain error.

`TopologicalCycleError` does not extend `PerantoError` — it is an internal utility error, not a user-facing domain error.

## Implementation Plan

1. Build an identity map from each node to its index in `nodes` (for stable tiebreaking).
2. Build an adjacency list: for each node, resolve `edges(node)` and filter to nodes present in the input set.
3. Compute in-degrees from the adjacency list.
4. Seed a queue with all zero-in-degree nodes, ordered by insertion index.
5. BFS: dequeue a node, push to result, decrement in-degrees of its dependents. When a dependent reaches zero, enqueue it (maintaining insertion-index order).
6. If `result.length < nodes.length`, throw `TopologicalCycleError` with the remaining unplaced nodes.

## Tests

- Empty input returns `[]`.
- Single node returns `[node]`.
- Linear chain: A → B → C produces `[C, B, A]`.
- Diamond: A uses B and C, both use D → D comes first, A comes last, B/C ordered by insertion.
- Disjoint groups: tiebroken by insertion order.
- Self-cycle: throws `TopologicalCycleError`.
- Mutual cycle: A uses B, B uses A → throws.
- Larger cycle buried in a graph → throws, `remaining` contains cycle participants.
- Unknown edge targets (not in `nodes`) are silently ignored.

## Out of Scope

- Domain-specific error classes (callers wrap the cycle signal into their own errors).
- Lifecycle hook invocation (belongs to t0006).
