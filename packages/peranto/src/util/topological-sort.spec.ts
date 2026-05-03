import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {TopologicalCycleError, topologicalSort} from "./topological-sort.ts";

describe("topologicalSort", () => {
    it("returns empty array for empty input", () => {
        const result = topologicalSort([], () => []);
        assert.deepStrictEqual(result, []);
    });

    it("returns single node unchanged", () => {
        const result = topologicalSort(["a"], () => []);
        assert.deepStrictEqual(result, ["a"]);
    });

    it("orders a linear chain by dependencies", () => {
        const deps = new Map<string, string[]>([
            ["a", ["b"]],
            ["b", ["c"]],
            ["c", []],
        ]);
        const result = topologicalSort(
            ["a", "b", "c"],
            (node) => deps.get(node) ?? [],
        );
        assert.deepStrictEqual(result, ["c", "b", "a"]);
    });

    it("orders a diamond with insertion-order tiebreaker", () => {
        const deps = new Map<string, string[]>([
            ["a", ["b", "c"]],
            ["b", ["d"]],
            ["c", ["d"]],
            ["d", []],
        ]);
        const result = topologicalSort(
            ["a", "b", "c", "d"],
            (node) => deps.get(node) ?? [],
        );
        assert.deepStrictEqual(result, ["d", "b", "c", "a"]);
    });

    it("tiebreaks disjoint groups by insertion order", () => {
        const result = topologicalSort(
            ["x", "y", "z"],
            () => [],
        );
        assert.deepStrictEqual(result, ["x", "y", "z"]);
    });

    it("throws TopologicalCycleError on self-cycle", () => {
        assert.throws(
            () => topologicalSort(["a"], (node) => [node]),
            (error: unknown) => {
                assert.ok(error instanceof TopologicalCycleError);
                assert.deepStrictEqual(error.remaining, ["a"]);
                return true;
            },
        );
    });

    it("throws TopologicalCycleError on mutual cycle", () => {
        const deps = new Map<string, string[]>([
            ["a", ["b"]],
            ["b", ["a"]],
        ]);
        assert.throws(
            () => topologicalSort(["a", "b"], (node) => deps.get(node) ?? []),
            (error: unknown) => {
                assert.ok(error instanceof TopologicalCycleError);
                assert.deepStrictEqual(error.remaining, ["a", "b"]);
                return true;
            },
        );
    });

    it("throws TopologicalCycleError with cycle participants in a larger graph", () => {
        const deps = new Map<string, string[]>([
            ["a", []],
            ["b", ["c"]],
            ["c", ["d"]],
            ["d", ["b"]],
        ]);
        assert.throws(
            () => topologicalSort(
                ["a", "b", "c", "d"],
                (node) => deps.get(node) ?? [],
            ),
            (error: unknown) => {
                assert.ok(error instanceof TopologicalCycleError);
                assert.deepStrictEqual(error.remaining, ["b", "c", "d"]);
                return true;
            },
        );
    });

    it("ignores edge targets not present in nodes", () => {
        const deps = new Map<string, string[]>([
            ["a", ["b", "unknown"]],
            ["b", []],
        ]);
        const result = topologicalSort(
            ["a", "b"],
            (node) => deps.get(node) ?? [],
        );
        assert.deepStrictEqual(result, ["b", "a"]);
    });
});
