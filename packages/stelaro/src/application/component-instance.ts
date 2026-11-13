import type {AnyComponentCallReference, AnyComponentCalls, CallOutput, ComponentCallName, ComponentId} from "../component/calls.ts";
import type {AnyComponent, ComponentCallHandler, ComponentContext, ComponentHooks} from "../component/definition.ts";
import type {Logger} from "../component/logger.ts";
import {loadComponentConfig, loadComponentSecrets} from "../config/load.ts";
import type {DataAccess} from "../data/access.ts";
import {CallInputError, UndeclaredCallError, UnregisteredCallError} from "./error.ts";
import type {RegisteredCall} from "./registry.ts";

type AnyComponentContext = ComponentContext<readonly AnyComponentCalls[], never, never, never> & {
    readonly state?: unknown;
    readonly config?: unknown;
    readonly secrets?: unknown;
};

type HookScope = {active: boolean};

export type DispatchCall = <TCall extends AnyComponentCallReference>(
    reference: TCall, input: unknown, scope: HookScope | null,
) => Promise<CallOutput<TCall>>;

type ValidatedConfigValue = {readonly value: unknown} | null;

type ComponentConfiguration = {
    readonly config: ValidatedConfigValue;
    readonly secrets: ValidatedConfigValue;
};

function createComponentDependencyMap(definition: AnyComponent): Map<ComponentId, Map<ComponentCallName, AnyComponentCallReference>> {
    const dependencies = new Map<ComponentId, Map<ComponentCallName, AnyComponentCallReference>>();
    for(const surface of definition.uses) {
        let references = dependencies.get(surface.id);
        if(references == null) {
            references = new Map();
            dependencies.set(surface.id, references);
        }
        for(const reference of Object.values(surface.calls)) {
            references.set(reference.name, reference);
        }
    }
    return dependencies;
}

function checkComponentCallReference(id: ComponentId, dependencies: Map<ComponentId, Map<ComponentCallName, AnyComponentCallReference>>, reference: AnyComponentCallReference): void {
    if(dependencies.get(reference.component_id)?.get(reference.name) !== reference) {
        throw new UndeclaredCallError(id, reference.component_id, reference.name);
    }
}

export function createComponentInstance(
    definition: AnyComponent,
    calls: ReadonlyMap<ComponentCallName, RegisteredCall>,
    log: Logger,
    data: DataAccess,
    dispatchCall: DispatchCall,
) {
    const {id} = definition.calls;
    const state = definition.state == null ? {} : {state: definition.state()};
    const dependencies = createComponentDependencyMap(definition);

    let is_started = false;
    let config: ValidatedConfigValue = null;
    let secrets: ValidatedConfigValue = null;

    function createContext(scope: HookScope | null): AnyComponentContext {
        const context: AnyComponentContext = {
            log,
            data,
            ...state,
            async call(reference, input) {
                checkComponentCallReference(id, dependencies, reference);
                return dispatchCall(reference, input, scope);
            },
        };
        if(definition.config != null) {
            Object.defineProperty(context, "config", {enumerable: true, get: () => config?.value});
        }
        if(definition.secrets != null) {
            Object.defineProperty(context, "secrets", {enumerable: true, get: () => secrets?.value});
        }
        return context;
    }

    // Each context is built from the same definition as the hooks.
    const hooks = definition as AnyComponent & ComponentHooks<AnyComponentContext>;
    const context = createContext(null);
    return {
        log,
        get is_started() { return is_started; },
        async loadConfiguration(config_dir: string, env: string | null, secrets_dir: string | null): Promise<ComponentConfiguration> {
            const [loaded_config, loaded_secrets] = await Promise.all([
                loadComponentConfig(definition, config_dir, env),
                secrets_dir === null ? secrets : loadComponentSecrets(definition, secrets_dir, env, log),
            ]);
            return {config: loaded_config, secrets: loaded_secrets};
        },
        installConfiguration(values: ComponentConfiguration): void {
            config = values.config;
            secrets = values.secrets;
            log.debug("Configuration installed.");
        },
        async runConfigReloadHook(): Promise<void> {
            await hooks.onConfigReload?.(context);
        },
        async runHook(operation: "start" | "stop"): Promise<void> {
            is_started = false;
            const scope = {active: true};
            try {
                await hooks[operation]?.(createContext(scope));
                is_started = operation === "start";
            } finally {
                // Saved call functions share this permission and lose it when the hook settles.
                scope.active = false;
            }
        },
        async invoke<TCall extends AnyComponentCallReference>(
            reference: TCall, input: unknown, scope: HookScope | null,
        ): Promise<CallOutput<TCall>> {
            const entry = calls.get(reference.name);
            // The caller's types come from the supplied reference. The same ID and name can have different schemas.
            if(entry?.reference !== reference) {
                throw new UnregisteredCallError(id, reference.name);
            }
            let validated_input: unknown;
            try {
                // Local schemas implement assert as identity.
                validated_input = reference.input.assert(input);
            } catch (cause) {
                throw new CallInputError(id, reference.name, cause);
            }

            // Registration paired this handler with the schema, and this instance supplies its context.
            const handler = entry.handler as ComponentCallHandler<AnyComponentContext, unknown, unknown>;
            const call_context = scope === null ? context : createContext(scope);
            const output = await (typeof handler === "function"
                ? handler(call_context, validated_input)
                : handler.handle(call_context, validated_input));
            const output_schema: TCall["output"] = reference.output;
            return output_schema.assert(output);
        },
    };
}

export type AnyComponentInstance = ReturnType<typeof createComponentInstance>;
