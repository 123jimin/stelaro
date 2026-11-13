import {equal, ok} from "node:assert/strict";
import {test} from "node:test";

import {ComponentNotReadyError, StelaroError, UserFacingError} from "../index.ts";

test("ComponentNotReadyError reports the component ID", () => {
    const error = new ComponentNotReadyError("worker");
    ok(error instanceof StelaroError);
    equal(error.name, "ComponentNotReadyError");
    equal(error.component_id, "worker");
});

test("UserFacingError exposes the user message and preserves the optional cause", () => {
    const cause = new Error("internal failure");
    const error = new UserFacingError("Try again later.", {cause});
    ok(error instanceof StelaroError);
    equal(error.name, "UserFacingError");
    equal(error.user_message, "Try again later.");
    equal(error.message, error.user_message);
    equal(error.cause, cause);
    equal(Object.hasOwn(new UserFacingError("Try again later."), "cause"), false);
});
