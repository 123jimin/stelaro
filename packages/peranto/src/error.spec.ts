import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
    CircularDependencyError,
    DuplicateCallError,
    MissingDependencyError,
    MissingHandlerError,
    PerantoError,
    UndeclaredCallError,
    UnregisteredCallError,
} from "./error.ts";
import {LifecycleStateError} from "./lifecycle.ts";

describe("@jiminp/peranto errors", () => {
    it("MissingDependencyError extends PerantoError with structured properties", () => {
        const error = new MissingDependencyError("page", "counter");

        assert.ok(error instanceof PerantoError);
        assert.ok(error instanceof Error);
        assert.deepStrictEqual(error.name, "MissingDependencyError");
        assert.deepStrictEqual(error.component_id, "page");
        assert.deepStrictEqual(error.dependency_id, "counter");
        assert.ok(error.message.includes("page"));
        assert.ok(error.message.includes("counter"));
    });

    it("MissingHandlerError extends PerantoError with structured properties", () => {
        const error = new MissingHandlerError("counter", "increment");

        assert.ok(error instanceof PerantoError);
        assert.ok(error instanceof Error);
        assert.deepStrictEqual(error.name, "MissingHandlerError");
        assert.deepStrictEqual(error.component_id, "counter");
        assert.deepStrictEqual(error.call_name, "increment");
    });

    it("DuplicateCallError extends PerantoError with structured properties", () => {
        const error = new DuplicateCallError(["counter.get", "counter.set"]);

        assert.ok(error instanceof PerantoError);
        assert.ok(error instanceof Error);
        assert.deepStrictEqual(error.name, "DuplicateCallError");
        assert.deepStrictEqual(error.duplicate_keys, ["counter.get", "counter.set"]);
        assert.ok(error.message.includes("counter.get"));
        assert.ok(error.message.includes("counter.set"));
    });

    it("UnregisteredCallError extends PerantoError with structured properties", () => {
        const error = new UnregisteredCallError("counter", "increment");

        assert.ok(error instanceof PerantoError);
        assert.ok(error instanceof Error);
        assert.deepStrictEqual(error.name, "UnregisteredCallError");
        assert.deepStrictEqual(error.component_id, "counter");
        assert.deepStrictEqual(error.call_name, "increment");
    });

    it("UndeclaredCallError extends PerantoError with structured properties", () => {
        const error = new UndeclaredCallError("page", "counter", "current");

        assert.ok(error instanceof PerantoError);
        assert.ok(error instanceof Error);
        assert.deepStrictEqual(error.name, "UndeclaredCallError");
        assert.deepStrictEqual(error.component_id, "page");
        assert.deepStrictEqual(error.target_component_id, "counter");
        assert.deepStrictEqual(error.target_call_name, "current");
    });

    it("CircularDependencyError extends PerantoError with structured properties", () => {
        const error = new CircularDependencyError(["a", "b"]);

        assert.ok(error instanceof PerantoError);
        assert.ok(error instanceof Error);
        assert.deepStrictEqual(error.name, "CircularDependencyError");
        assert.deepStrictEqual(error.component_ids, ["a", "b"]);
        assert.ok(error.message.includes("a"));
        assert.ok(error.message.includes("b"));
    });

    it("LifecycleStateError extends PerantoError with structured properties", () => {
        const error = new LifecycleStateError("idle", "call");

        assert.ok(error instanceof PerantoError);
        assert.ok(error instanceof Error);
        assert.deepStrictEqual(error.name, "LifecycleStateError");
        assert.deepStrictEqual(error.current_state, "idle");
        assert.deepStrictEqual(error.operation, "call");
        assert.ok(error.message.includes("idle"));
        assert.ok(error.message.includes("call"));
    });
});
