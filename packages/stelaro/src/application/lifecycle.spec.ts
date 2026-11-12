import {equal, ok, throws} from "node:assert/strict";
import {test} from "node:test";

import {LifecycleStateError, StelaroError} from "../index.ts";
import {createLifecycleMachine} from "./lifecycle.ts";

test("the lifecycle machine follows startup, reload, and shutdown transitions", () => {
    const machine = createLifecycleMachine();
    const other = createLifecycleMachine();
    equal(machine.state, "idle");

    const transitions = [
        ["start", ["idle"], "starting"],
        ["start", ["starting"], "active"],
        ["reloadConfig", ["active"], "reloading"],
        ["reloadConfig", ["reloading"], "active"],
        ["stop", ["active", "failed"], "stopping"],
        ["stop", ["stopping"], "idle"],
    ] as const;
    for(const [operation, allowed_from, next_state] of transitions) {
        machine.applyTransition(operation, allowed_from, next_state);
        equal(machine.state, next_state);
        equal(other.state, "idle");
    }
});

test("failed startup and failed reload can transition to shutdown", () => {
    const machine = createLifecycleMachine();
    machine.applyTransition("start", ["idle"], "starting");
    machine.applyTransition("start", ["starting"], "failed");
    equal(machine.state, "failed");
    machine.applyTransition("stop", ["active", "failed"], "stopping");
    machine.applyTransition("stop", ["stopping"], "idle");

    machine.applyTransition("start", ["idle"], "starting");
    machine.applyTransition("start", ["starting"], "active");
    machine.applyTransition("reloadConfig", ["active"], "reloading");
    machine.applyTransition("reloadConfig", ["reloading"], "failed");
    equal(machine.state, "failed");
    machine.applyTransition("stop", ["active", "failed"], "stopping");
    machine.applyTransition("stop", ["stopping"], "idle");
    equal(machine.state, "idle");
});

test("the caller supplies the allowed source states for each transition", () => {
    const machine = createLifecycleMachine();
    throws(() => machine.applyTransition("prepare", ["failed"], "starting"), LifecycleStateError);
    machine.applyTransition("prepare", ["idle"], "failed");
    equal(machine.state, "failed");
});

test("invalid transitions report the current state and operation without changing state", () => {
    const machine = createLifecycleMachine();
    throws(() => machine.applyTransition("stop", ["active", "failed"], "stopping"), (error: unknown) => {
        ok(error instanceof LifecycleStateError);
        ok(error instanceof StelaroError);
        equal(error.current_state, "idle");
        equal(error.operation, "stop");
        return true;
    });
    equal(machine.state, "idle");

    machine.applyTransition("start", ["idle"], "starting");
    throws(() => machine.applyTransition("start", ["idle"], "starting"), {current_state: "starting", operation: "start"});
    throws(() => machine.applyTransition("stop", ["active", "failed"], "stopping"), {current_state: "starting", operation: "stop"});
    equal(machine.state, "starting");

    machine.applyTransition("start", ["starting"], "active");
    machine.applyTransition("stop", ["active", "failed"], "stopping");
    throws(() => machine.applyTransition("start", ["idle"], "starting"), {current_state: "stopping", operation: "start"});
    equal(machine.state, "stopping");
});
