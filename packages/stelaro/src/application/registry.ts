import type {AnyComponentCallReference, ComponentCallName, ComponentId} from "../component/calls.ts";
import type {AnyComponent} from "../component/definition.ts";
import {DuplicateCallError} from "../component/error.ts";
import {CircularDependencyError, DuplicateComponentIdError, MissingDependencyError, MissingHandlerError, UnregisteredCallError} from "./error.ts";

function indexComponents<TComponent extends AnyComponent>(components: readonly TComponent[]): Map<ComponentId, TComponent> {
    const components_by_id = new Map<ComponentId, TComponent>();
    for(const component of components) {
        const {id} = component.calls;
        if(components_by_id.has(id)) {
            throw new DuplicateComponentIdError(id);
        }
        components_by_id.set(id, component);
    }
    return components_by_id;
}

function sortIndexedComponents<TComponent extends AnyComponent>(components_by_id: ReadonlyMap<ComponentId, TComponent>): TComponent[] {
    const sorted: TComponent[] = [];
    const completed = new Set<ComponentId>();
    const visiting = new Set<ComponentId>();

    for(const [id, component] of components_by_id) {
        if(completed.has(id)) {
            continue;
        }
        const stack = [{component, dependencies: component.uses.values()}];
        visiting.add(id);

        for(let frame = stack.at(-1); frame != null; frame = stack.at(-1)) {
            const next = frame.dependencies.next();
            if(next.done) {
                const finished_id = frame.component.calls.id;
                sorted.push(frame.component);
                completed.add(finished_id);
                visiting.delete(finished_id);
                stack.pop();
                continue;
            }

            const dependency_id = next.value.id;
            const dependency = components_by_id.get(dependency_id);
            if(dependency == null || completed.has(dependency_id)) {
                continue;
            }
            if(visiting.has(dependency_id)) {
                const path = stack.map(({component}) => component.calls.id);
                throw new CircularDependencyError([...path.slice(path.indexOf(dependency_id)), dependency_id]);
            }
            visiting.add(dependency_id);
            stack.push({component: dependency, dependencies: dependency.uses.values()});
        }
    }
    return sorted;
}

/**
 * Sort components so that each included dependency precedes its consumers.
 *
 * @typeParam TComponent - Component type from the input list
 * @param components - Components to sort
 * @returns A new array of components in start order
 * @throws {DuplicateComponentIdError} More than one component has the same ID.
 * @throws {CircularDependencyError} Dependencies within the list form a cycle.
 *
 * @remarks
 * The sort uses dependency IDs and ignores dependencies absent from the input list.
 *
 * @example
 * ```typescript
 * import {defineComponent, defineComponentCalls, sortComponentsByUses} from "@jiminp/stelaro";
 *
 * const calls = defineComponentCalls("storage", {});
 * const storage = defineComponent({calls, uses: [], handlers: {}});
 * const worker = defineComponent({calls: defineComponentCalls("worker", {}), uses: [calls], handlers: {}});
 * const start_order = sortComponentsByUses([worker, storage]); // [storage, worker]
 * ```
 *
 * @category Application
 */
export function sortComponentsByUses<TComponent extends AnyComponent>(components: readonly TComponent[]): TComponent[] {
    return sortIndexedComponents(indexComponents(components));
}

export type RegisteredCall = {
    readonly reference: AnyComponentCallReference;
    readonly handler: AnyComponent["handlers"][ComponentCallName];
};

type RegisteredComponent<TComponent extends AnyComponent> = {
    readonly definition: TComponent;
    readonly calls: ReadonlyMap<ComponentCallName, RegisteredCall>;
};

/** Register components in dependency order, preserved by Map iteration. */
export function createComponentRegistry<TComponent extends AnyComponent>(
    components: readonly TComponent[],
): ReadonlyMap<ComponentId, RegisteredComponent<TComponent>> {
    const registry = new Map<ComponentId, RegisteredComponent<TComponent>>();
    for(const component of sortComponentsByUses(components)) {
        const {id} = component.calls;
        const calls = new Map<ComponentCallName, RegisteredCall>();
        const {handlers} = component;
        for(const reference of Object.values(component.calls.calls)) {
            const {name} = reference;
            if(calls.has(name)) {
                throw new DuplicateCallError(id, name);
            }
            const handler = handlers[name];
            if(!Object.hasOwn(handlers, name) || (typeof handler !== "function" && typeof handler?.handle !== "function")) {
                throw new MissingHandlerError(id, name);
            }
            calls.set(name, {reference, handler});
        }
        registry.set(id, {definition: component, calls});
    }

    for(const [id, {definition}] of registry) {
        for(const dependency of definition.uses) {
            const registered = registry.get(dependency.id);
            if(registered == null) {
                throw new MissingDependencyError(id, dependency.id);
            }
            for(const reference of Object.values(dependency.calls)) {
                if(registered.calls.get(reference.name)?.reference !== reference) {
                    throw new UnregisteredCallError(dependency.id, reference.name);
                }
            }
        }
    }

    return registry;
}
