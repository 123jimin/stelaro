import {deepEqual, equal, throws} from "node:assert/strict";
import {test} from "node:test";

import {type} from "arktype";

import type {AnyComponent} from "../index.ts";
import {
    CircularDependencyError, defineComponent, defineComponentCalls, DuplicateCallError, DuplicateComponentIdError,
    EmptyInput, mergeComponentCalls, MissingDependencyError, MissingHandlerError, sortComponentsByUses, UnregisteredCallError,
} from "../index.ts";
import {createComponentRegistry} from "./registry.ts";

const StatusCall = {input: EmptyInput, output: type("boolean")};

test("registration accepts subsets of a merged surface and indexes handlers in dependency order", () => {
    const storage_calls = defineComponentCalls("storage", {ready: StatusCall});
    const internal_calls = defineComponentCalls("storage", {busy: StatusCall});
    const worker_calls = defineComponentCalls("worker", {ready: StatusCall});
    const service_calls = defineComponentCalls("service", {});
    const storage = defineComponent({
        calls: mergeComponentCalls(storage_calls, internal_calls),
        uses: [],
        handlers: {ready: () => true, busy: {handle: () => false}},
    });
    const worker = defineComponent({calls: worker_calls, uses: [storage_calls], handlers: {ready: () => true}});
    const service = defineComponent({calls: service_calls, uses: [worker_calls, storage_calls], handlers: {}});
    const components = [service, worker, storage] as const;
    const registry = createComponentRegistry(components);

    const start_order = Array.from(registry.values(), ({definition}) => definition);
    deepEqual(start_order, [storage, worker, service]);
    deepEqual(sortComponentsByUses(components), start_order);
    equal(registry.get("worker")?.definition, worker);
    const storage_entries = registry.get("storage")?.calls;
    equal(storage_entries?.get("ready")?.reference, storage_calls.calls.ready);
    equal(storage_entries?.get("busy")?.handler, storage.handlers.busy);
    equal(registry.get("worker")?.calls.get("ready")?.handler, worker.handlers.ready);
    equal(components[0], service);
});

test("registration rejects missing dependencies and the sorter accepts incomplete lists", () => {
    const storage_calls = defineComponentCalls("storage", {});
    const worker = defineComponent({calls: defineComponentCalls("worker", {}), uses: [storage_calls], handlers: {}});

    throws(() => createComponentRegistry([worker]), {
        name: MissingDependencyError.name, component_id: "worker", dependency_id: "storage",
    });
    deepEqual(sortComponentsByUses([worker]), [worker]);
    deepEqual(sortComponentsByUses([]), []);
});

test("registration rejects absent calls and separately declared references with the same name", () => {
    const storage_calls = defineComponentCalls("storage", {ready: StatusCall});
    const storage = defineComponent({calls: storage_calls, uses: [], handlers: {ready: () => true}});
    for(const [name, dependency] of [
        ["busy", defineComponentCalls("storage", {busy: StatusCall})],
        ["ready", defineComponentCalls("storage", {ready: {input: type("string"), output: type("number")}})],
    ] as const) {
        const worker = defineComponent({calls: defineComponentCalls("worker", {}), uses: [dependency], handlers: {}});
        throws(() => createComponentRegistry([worker, storage]), {
            name: UnregisteredCallError.name, component_id: "storage", call_name: name,
        });
        deepEqual(sortComponentsByUses([worker, storage]), [storage, worker]);
    }
});

test("registration and sorting reject duplicate component IDs and report cycles", () => {
    const first = defineComponentCalls("first", {});
    const second = defineComponentCalls("second", {});
    const consumer = defineComponentCalls("consumer", {});
    const first_component = defineComponent({calls: first, uses: [second], handlers: {}});
    const second_component = defineComponent({calls: second, uses: [first], handlers: {}});
    const consumer_component = defineComponent({calls: consumer, uses: [first], handlers: {}});
    const self_dependent = defineComponent({calls: first, uses: [first], handlers: {}});

    const processors: ((components: readonly AnyComponent[]) => unknown)[] = [createComponentRegistry, sortComponentsByUses];
    for(const processComponents of processors) {
        throws(() => processComponents([first_component, first_component]), {
            name: DuplicateComponentIdError.name, component_id: "first",
        });
        throws(() => processComponents([consumer_component, first_component, second_component]), {
            name: CircularDependencyError.name, cycle: ["first", "second", "first"],
        });
        throws(() => processComponents([self_dependent]), {
            name: CircularDependencyError.name, cycle: ["first", "first"],
        });
    }
});

test("registration rejects duplicate call IDs and missing own handlers", () => {
    const calls = defineComponentCalls("worker", {ready: StatusCall});
    const duplicate: AnyComponent = {
        calls: {id: calls.id, calls: {...calls.calls, alias: calls.calls.ready}},
        uses: [],
        handlers: {ready: () => true},
    };
    throws(() => createComponentRegistry([duplicate]), {
        name: DuplicateCallError.name, component_id: "worker", call_name: "ready",
    });

    const missing: AnyComponent = {
        calls: defineComponentCalls("worker", {toString: StatusCall}),
        uses: [],
        handlers: {},
    };
    throws(() => createComponentRegistry([missing]), {
        name: MissingHandlerError.name, component_id: "worker", call_name: "toString",
    });
});
