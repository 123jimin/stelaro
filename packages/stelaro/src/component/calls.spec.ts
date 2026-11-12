import {deepEqual, equal, ok, throws} from "node:assert/strict";
import {test} from "node:test";

import {assertEqualType} from "@jiminp/tooltool";
import {type} from "arktype";

import type {
    AnyComponentCallReference, AnyComponentCalls, CallFrom, CallInput, CallOutput, ComponentCallFn,
    ComponentCallHandler, MergedCallReferences, MergedComponentCalls, StateFactory,
} from "../index.ts";
import {
    defineComponentCalls, DuplicateCallError, EmptyInput, InvalidComponentIdError, mergeComponentCalls,
    MismatchedComponentIdError, StelaroError,
} from "../index.ts";

test("call references preserve literal names and the input and output sides of ArkType schemas", () => {
    const input = type("string").pipe((value) => value.length);
    const output = type("number").pipe((value): string => String(value));
    const surface = defineComponentCalls("worker-2", {countJobs: {input, output}});
    const call = surface.calls.countJobs;

    assertEqualType<typeof surface.id, "worker-2">();
    assertEqualType<typeof call.component_id, "worker-2">();
    assertEqualType<typeof call.name, "countJobs">();
    assertEqualType<typeof call.input.inferIn, string>();
    assertEqualType<typeof call.input.infer, number>();
    assertEqualType<typeof call.output.inferIn, number>();
    assertEqualType<typeof call.output.infer, string>();
    assertEqualType<CallInput<typeof call>, string>();
    assertEqualType<CallOutput<typeof call>, string>();
    assertEqualType<CallFrom<AnyComponentCalls>, AnyComponentCallReference>();
    type Invoke = ComponentCallFn<readonly [typeof surface]>;
    assertEqualType<Parameters<Invoke>, [reference: typeof call, input: string]>();
    assertEqualType<ReturnType<Invoke>, Promise<string>>();
    assertEqualType<Parameters<ComponentCallFn<readonly []>>[0], never>();
    type Context = {state: ReturnType<StateFactory<{jobs: number}>>};
    type Handler = ComponentCallHandler<Context, typeof call.input.infer, typeof call.output.inferIn>;
    assertEqualType<Parameters<Exclude<Handler, {handle: unknown}>>, [context: Context, input: number]>();
    assertEqualType<ReturnType<Extract<Handler, {handle: unknown}>["handle"]>, number | Promise<number>>();
    equal(call.input, input);
    equal(call.output, output);
    equal(call.output.assert(call.input.assert("jobs")), "4");
});

test("component IDs use lowercase kebab-case", () => {
    for(const id of ["a", "web-api", "3d-printer"]) {
        equal(defineComponentCalls(id, {}).id, id);
    }
    for(const id of ["", "-app", "app-", "two--parts", "Web", "web_api", "web/api", "web\n"]) {
        throws(() => defineComponentCalls(id, {}), (error: unknown) => {
            ok(error instanceof InvalidComponentIdError);
            ok(error instanceof StelaroError);
            equal(error.component_id, id);
            return true;
        });
    }
});

test("merging call surfaces retains each concrete reference and its type", () => {
    const declaration = {input: EmptyInput, output: type("boolean")};
    const prototype_name = "__proto__";
    const first = defineComponentCalls("worker", {readStatus: declaration});
    const second = defineComponentCalls("worker", {countJobs: {input: type("number"), output: type("string")}});
    const third = defineComponentCalls("worker", {[prototype_name]: declaration});
    const merged = mergeComponentCalls(first, second, third);

    type Surfaces = readonly [typeof first, typeof second, typeof third];
    assertEqualType<typeof merged, MergedComponentCalls<Surfaces>>();
    assertEqualType<typeof merged.calls, MergedCallReferences<Surfaces>>();
    assertEqualType<CallFrom<typeof first | typeof second>, typeof first.calls.readStatus | typeof second.calls.countJobs>();
    assertEqualType<typeof merged.id, "worker">();
    assertEqualType<keyof typeof merged.calls, "readStatus" | "countJobs" | "__proto__">();
    assertEqualType<typeof merged.calls.readStatus, typeof first.calls.readStatus>();
    assertEqualType<typeof merged.calls.countJobs.output.infer, string>();
    equal(merged.calls.readStatus, first.calls.readStatus);
    equal(merged.calls.countJobs, second.calls.countJobs);
    equal(merged.calls[prototype_name], third.calls[prototype_name]);
    deepEqual(Object.keys(first.calls), ["readStatus"]);
    deepEqual(Object.keys(mergeComponentCalls(first).calls), ["readStatus"]);

    function mergeAlternative(surface: typeof second | typeof third) {
        return mergeComponentCalls(first, surface);
    }

    const alternative = mergeAlternative(second);
    assertEqualType<keyof typeof alternative.calls, "readStatus">();
    equal(alternative.calls.readStatus, first.calls.readStatus);
});

test("merging rejects mismatched component IDs and duplicate call names", () => {
    const declaration = {input: EmptyInput, output: type("boolean")};
    const first = defineComponentCalls("worker", {readStatus: declaration});
    const other = defineComponentCalls("scheduler", {readStatus: declaration});
    const duplicate = defineComponentCalls("worker", {readStatus: declaration});

    throws(() => mergeComponentCalls(first, other), (error: unknown) => {
        ok(error instanceof MismatchedComponentIdError);
        equal(error.expected_component_id, "worker");
        equal(error.actual_component_id, "scheduler");
        return true;
    });
    throws(() => mergeComponentCalls(first, duplicate), (error: unknown) => {
        ok(error instanceof DuplicateCallError);
        equal(error.component_id, "worker");
        equal(error.call_name, "readStatus");
        return true;
    });
});
