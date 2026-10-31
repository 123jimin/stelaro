import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {seededRandom, shuffle} from "../test-util.ts";
import {TopologicalCycleError, topologicalSort} from "./topological-sort.ts";

/** Sorts the keys of `graph`, each depending on the nodes it lists, in key order. */
function sortGraph(graph: Readonly<Record<string, readonly string[]>>): string[] {
    return topologicalSort(Object.keys(graph), (node) => graph[node] ?? []);
}

function remainingOf(graph: Readonly<Record<string, readonly string[]>>): unknown {
    let remaining: unknown = null;
    assert.throws(() => sortGraph(graph), (error: unknown) => {
        assert.ok(error instanceof TopologicalCycleError);
        remaining = error.remaining;
        return true;
    });
    return remaining;
}

describe("@jiminp/stelaro topologicalSort", () => {
    it("keeps the order of nodes without dependencies", () => {
        assert.deepStrictEqual(sortGraph({c: [], a: [], b: []}), ["c", "a", "b"]);
        assert.deepStrictEqual(sortGraph({}), []);
    });

    it("places each node after its dependencies in depth-first post-order", () => {
        assert.deepStrictEqual(sortGraph({c: ["a"], b: [], a: []}), ["a", "c", "b"]);
        assert.deepStrictEqual(sortGraph({d: ["b", "c"], c: ["a"], b: ["a"], a: []}), ["a", "b", "c", "d"]);
        assert.deepStrictEqual(sortGraph({a: [], b: ["a"], c: ["b"]}), ["a", "b", "c"]);
        assert.deepStrictEqual(sortGraph({x: ["z", "y"], y: [], z: ["y"]}), ["y", "z", "x"]);
    });

    it("ignores dependencies outside `nodes` and repeated edges", () => {
        assert.deepStrictEqual(sortGraph({b: ["a", "outside", "a"], a: ["missing"]}), ["a", "b"]);
    });

    it("orders a large random acyclic graph so that every node follows its dependencies", () => {
        const random = seededRandom(0x7090);
        const count = 300;
        // Edges only point to lower indices, so the graph is acyclic; the node list is shuffled.
        const graph: Record<string, string[]> = {};
        for(const i of shuffle(Array.from({length: count}, (_, i) => i), random)) {
            graph[`n${i}`] = i === 0 ? [] : Array.from({length: Math.floor(random() * 4)}, () => `n${Math.floor(random() * i)}`);
        }

        const sorted = sortGraph(graph);
        const position = new Map(sorted.map((node, index) => [node, index]));
        assert.strictEqual(sorted.length, count);
        for(const [node, dependencies] of Object.entries(graph)) {
            for(const dependency of dependencies) assert.ok(position.get(dependency)! < position.get(node)!, `${dependency} before ${node}`);
        }
    });

    it("throws RangeError for a node listed twice", () => {
        assert.throws(() => topologicalSort(["a", "b", "a"], () => []), RangeError);
        const node = {};
        assert.throws(() => topologicalSort([node, node], () => []), RangeError);
    });

    it("rejects a cycle with every node in or depending on it as `remaining`, in `nodes` order", () => {
        assert.deepStrictEqual(remainingOf({
            c: ["a"], // depends on the cycle
            d: [],
            a: ["b", "f"], // on the cycle
            e: ["d"],
            b: ["a"], // on the cycle
            f: [], // a dependency of the cycle
        }), ["c", "a", "b"]);
    });

    it("rejects a self-dependency and keeps the rest out of `remaining`", () => {
        assert.deepStrictEqual(remainingOf({a: [], b: ["b"], c: ["a"]}), ["b"]);
    });

    it("reports a node depending on a cycle even when the cycle is visited first", () => {
        assert.deepStrictEqual(remainingOf({a: ["b"], b: ["a"], z: ["a"]}), ["a", "b", "z"]);
        assert.deepStrictEqual(remainingOf({x: [], a: ["b"], b: ["c"], c: ["a"], y: ["c", "x"]}), ["a", "b", "c", "y"]);
    });
});
