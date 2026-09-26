import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {StelaroError, UserFacingError} from "../error.ts";
import {
    CircularDependencyError,
    DuplicateCallError,
    DuplicateComponentIdError,
    MissingDependencyError,
    MissingHandlerError,
    UndeclaredCallError,
    UnregisteredCallError,
    UnregisteredComponentError,
} from "./error.ts";
import {LifecycleStateError} from "./lifecycle.ts";

describe("@jiminp/stelaro errors", () => {
    it("extends StelaroError and names each error after its class", () => {
        const errors: readonly (readonly [StelaroError, string])[] = [
            [new UnregisteredComponentError("counter"), "UnregisteredComponentError"],
            [new DuplicateComponentIdError("counter"), "DuplicateComponentIdError"],
            [new MissingDependencyError("page", "counter"), "MissingDependencyError"],
            [new MissingHandlerError("counter", "increment"), "MissingHandlerError"],
            [new DuplicateCallError(["counter.get"]), "DuplicateCallError"],
            [new UnregisteredCallError("counter", "increment"), "UnregisteredCallError"],
            [new UndeclaredCallError("page", "counter", "current"), "UndeclaredCallError"],
            [new CircularDependencyError(["a", "b"]), "CircularDependencyError"],
            [new LifecycleStateError("idle", "call"), "LifecycleStateError"],
            [new UserFacingError("Permission denied."), "UserFacingError"],
        ];

        for(const [error, name] of errors) {
            assert.ok(error instanceof StelaroError, name);
            assert.strictEqual(error.name, name);
        }
    });
});
