import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {ConfigFileError, ConfigValidationError, SecretsFileError, SecretsValidationError} from "../config/error.ts";
import {ComponentNotReadyError, InvalidComponentIdError, MismatchedComponentIdError, StelaroError, UserFacingError} from "../error.ts";
import {NotRegularFileError} from "../fs/error.ts";
import * as core from "../index.ts";
import {
    CallInputError,
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

const specified_error_names = [
    "DuplicateComponentIdError",
    "MissingDependencyError",
    "MissingHandlerError",
    "DuplicateCallError",
    "UnregisteredCallError",
    "UnregisteredComponentError",
    "UndeclaredCallError",
    "CallInputError",
    "CircularDependencyError",
    "LifecycleStateError",
    "InvalidComponentIdError",
    "MismatchedComponentIdError",
    "ComponentNotReadyError",
    "UserFacingError",
    "ConfigFileError",
    "SecretsFileError",
    "ConfigValidationError",
    "SecretsValidationError",
    "NotRegularFileError",
] as const;

type ErrorClass = abstract new (...args: never) => Error;

function coreErrorClasses(): (readonly [string, ErrorClass])[] {
    return Object.entries<unknown>(core).filter((entry): entry is [string, ErrorClass] => {
        const value = entry[1];
        return typeof value === "function" && value.prototype instanceof Error;
    });
}

describe("@jiminp/stelaro errors", () => {
    it("exports every specified error from core", () => {
        const exported = new Set(coreErrorClasses().map(([name]) => name));

        for(const name of specified_error_names) {
            assert.ok(exported.has(name), name);
        }
    });

    it("derives every error exported from core from StelaroError and names its class with an Error suffix", () => {
        const classes = coreErrorClasses().filter(([, error_class]) => error_class !== StelaroError);
        assert.ok(classes.length >= specified_error_names.length);

        for(const [export_name, error_class] of classes) {
            assert.ok(error_class.prototype instanceof StelaroError, export_name);
            assert.match(error_class.name, /Error$/, export_name);
        }
    });

    it("carries a human-readable message", () => {
        const cause = new Error("cause");
        const errors: Record<(typeof specified_error_names)[number], StelaroError> = {
            DuplicateComponentIdError: new DuplicateComponentIdError("counter"),
            MissingDependencyError: new MissingDependencyError("page", "counter"),
            MissingHandlerError: new MissingHandlerError("counter", "increment"),
            DuplicateCallError: new DuplicateCallError(["counter.get"]),
            UnregisteredCallError: new UnregisteredCallError("counter", "increment"),
            UnregisteredComponentError: new UnregisteredComponentError("counter"),
            UndeclaredCallError: new UndeclaredCallError("page", "counter", "current"),
            CallInputError: new CallInputError("counter", "set", cause),
            CircularDependencyError: new CircularDependencyError(["a", "b"]),
            LifecycleStateError: new LifecycleStateError("idle", "call"),
            InvalidComponentIdError: new InvalidComponentIdError("Bad_Id"),
            MismatchedComponentIdError: new MismatchedComponentIdError("a", "b"),
            ComponentNotReadyError: new ComponentNotReadyError("counter"),
            UserFacingError: new UserFacingError("Please try again later."),
            ConfigFileError: new ConfigFileError("config/counter.toml", "counter", cause),
            SecretsFileError: new SecretsFileError("secrets/counter.toml", "counter", cause),
            ConfigValidationError: new ConfigValidationError("config/counter.toml", "counter", cause),
            SecretsValidationError: new SecretsValidationError("secrets/counter.toml", "counter", cause),
            NotRegularFileError: new NotRegularFileError("data/counter"),
        };

        for(const [name, error] of Object.entries(errors)) {
            assert.ok(error.message.trim().length > 0, name);
        }
    });

    it("keeps a UserFacingError's user message apart from its internal cause", () => {
        const cause = new Error("database connection refused");
        const error = new UserFacingError("Please try again later.", {cause});

        assert.strictEqual(error.user_message, "Please try again later.");
        assert.strictEqual(error.cause, cause);
    });
});

function assertTypeBehavior() {
    // @ts-expect-error StelaroError is abstract.
    void new StelaroError("message");

    const duplicate = new DuplicateComponentIdError("counter");
    // @ts-expect-error structured error properties are readonly.
    duplicate.component_id = "other";

    const lifecycle = new LifecycleStateError("idle", "call");
    // @ts-expect-error structured error properties are readonly.
    lifecycle.current_state = "active";

    const user_facing = new UserFacingError("Nope.");
    // @ts-expect-error structured error properties are readonly.
    user_facing.user_message = "Other.";
}

void assertTypeBehavior;
