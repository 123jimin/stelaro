import type {Promisable} from "@jiminp/tooltool";

import type {AnyComponentCallReference, AnyComponentCalls, CallOutput, ComponentCallFn, ComponentCallName, ComponentId} from "../component/calls.ts";
import type {AnyComponent, ComponentCallHandler, ComponentContext, ComponentHooks} from "../component/definition.ts";
import type {LoggerFactory} from "../component/logger.ts";
import {consoleLoggerFactory} from "../component/logger.ts";
import {loadComponentConfig, loadComponentSecrets} from "../config/load.ts";
import type {DataAccess} from "../data/access.ts";
import {createDataAccess} from "../data/access.ts";
import {resolveApplicationDirectories} from "./directories.ts";
import {CallInputError, UndeclaredCallError, UnregisteredCallError} from "./error.ts";
import {createLifecycleMachine, LifecycleStateError} from "./lifecycle.ts";
import {createComponentRegistry} from "./registry.ts";

/**
 * Startup overrides for an application instance.
 *
 * @typeParam TEnv - Accepted environment names (default: `string`)
 *
 * @category Application
 */
export type ApplicationOptions<TEnv extends string = string> = {
    /** The base directory for relative overrides, defaulting to the working directory. */
    readonly base_dir?: string | null;
    /** The configuration directory, defaulting to `config` under the base directory. */
    readonly config_dir?: string | null;
    /** The secrets directory, defaulting to `secrets` under the base directory. */
    readonly secrets_dir?: string | null;
    /** The data directory, defaulting to `data` under the base directory. */
    readonly data_dir?: string | null;
    /** The environment that selects configuration and secrets overlays. */
    readonly env?: TEnv | null;
};

/**
 * The components and shared capabilities of an application.
 *
 * @typeParam TComponents - Registered component definitions
 *
 * @category Application
 */
export type ApplicationDefinition<TComponents extends readonly AnyComponent[]> = {
    /** The component definitions registered by the application. */
    readonly components: TComponents;
    /** The logger factory shared by the application and components. */
    readonly logger?: LoggerFactory;
    /** The application hook invoked after a full configuration reload. */
    readonly onConfigReload?: () => Promisable<void>;
};

/**
 * A runtime with typed access to its registered component calls.
 *
 * @typeParam TComponents - Registered component definitions
 *
 * @category Application
 */
export type Application<TComponents extends readonly AnyComponent[]> = {
    /** The application-wide data directory and file access. */
    readonly data: DataAccess;
    /** The logger factory used by the runtime. */
    readonly logger: LoggerFactory;

    /**
     * Load configuration and secrets and start components in dependency order.
     *
     * @returns A promise that resolves when all components have started
     * @throws {LifecycleStateError} The application is not idle.
     * @throws {ConfigFileError} A required configuration file is missing or a configuration file cannot be read or parsed.
     * @throws {ConfigValidationError} A component's configuration fails its schema.
     * @throws {SecretsFileError} A secrets file cannot be read or parsed.
     * @throws {SecretsValidationError} A component's secrets fail their schema.
     */
    start(): Promise<void>;

    /**
     * Stop the started components in reverse dependency order.
     *
     * @returns A promise that resolves when shutdown completes
     * @throws {LifecycleStateError} The application is neither active nor failed.
     * @throws {AggregateError} One or more component stop hooks failed.
     */
    stop(): Promise<void>;

    /**
     * Call a registered component using its declared input and output schemas.
     *
     * @param reference - Reference to a registered call
     * @param input - Input accepted by the referenced call
     * @returns The validated result of the call
     * @throws {LifecycleStateError} The application is outside the active and reloading states.
     * @throws {UnregisteredCallError} The reference is absent from the registered surfaces.
     * @throws {CallInputError} The input fails schema validation.
     */
    readonly call: ComponentCallFn<readonly TComponents[number]["calls"][]>;
};

/**
 * Define an application and preserve the types of its registered components.
 *
 * @typeParam TComponents - Registered component definitions
 * @param definition - Components, logger factory, and optional reload hook
 * @returns The supplied application definition
 *
 * @category Application
 */
export function defineApplication<const TComponents extends readonly AnyComponent[]>(
    definition: ApplicationDefinition<TComponents>,
): ApplicationDefinition<TComponents> {
    return definition;
}

type AnyComponentContext = ComponentContext<readonly AnyComponentCalls[], never, never, never> & {
    state?: unknown;
    config?: unknown;
    secrets?: unknown;
};

type RuntimeComponent = Omit<AnyComponent, keyof ComponentHooks<never> | "handlers">
    & ComponentHooks<AnyComponentContext>
    & {readonly handlers: Readonly<Record<ComponentCallName, ComponentCallHandler<AnyComponentContext, unknown, unknown>>>};

type HookScope = {active: boolean};

type AnyComponentInstance = {
    readonly definition: RuntimeComponent;
    readonly context: AnyComponentContext;
    contextForHook(scope: HookScope): AnyComponentContext;
};

async function invokeCall<TCall extends AnyComponentCallReference>(
    reference: TCall,
    handler: ComponentCallHandler<AnyComponentContext, unknown, unknown>,
    context: AnyComponentContext,
    input: unknown,
): Promise<CallOutput<TCall>> {
    let validated_input: unknown;
    try {
        // Local schemas implement assert as identity.
        validated_input = reference.input.assert(input);
    } catch (cause) {
        throw new CallInputError(reference.component_id, reference.name, cause);
    }

    const output = await (typeof handler === "function" ? handler(context, validated_input) : handler.handle(context, validated_input));
    const output_schema: TCall["output"] = reference.output;
    return output_schema.assert(output);
}

/**
 * Create an independent runtime from the application's component definitions.
 *
 * @typeParam TComponents - Registered component definitions
 * @param definition - Components and shared capabilities
 * @param options - Startup directory and environment overrides
 * @returns An idle application runtime
 * @throws {DuplicateComponentIdError} Two components have the same ID.
 * @throws {DuplicateCallError} A component has more than one reference for a call name.
 * @throws {MissingHandlerError} A registered call has no handler.
 * @throws {MissingDependencyError} A component depends on an unregistered component.
 * @throws {UnregisteredCallError} A dependency refers to a call outside the registered surface.
 * @throws {CircularDependencyError} Component dependencies form a cycle.
 *
 * @example
 * ```typescript
 * import {createApplication, defineApplication, parseArgs} from "@jiminp/stelaro";
 *
 * const app = createApplication(defineApplication({components: []}), parseArgs());
 * await app.start();
 * await app.stop();
 * ```
 *
 * @category Application
 */
export function createApplication<const TComponents extends readonly AnyComponent[]>(
    definition: ApplicationDefinition<TComponents>,
    options: ApplicationOptions = {},
): Application<TComponents> {
    const components: readonly AnyComponent[] = definition.components;
    // Registration pairs each handler with its schema. The runtime builds the matching context from each definition.
    const registry = createComponentRegistry(components as readonly RuntimeComponent[]);
    const {config_dir, secrets_dir, data_dir} = resolveApplicationDirectories(options);
    const env = options.env ?? null;
    const logger = definition.logger ?? consoleLoggerFactory;
    const data = createDataAccess(data_dir);
    const lifecycle = createLifecycleMachine();
    const instances = new Map<ComponentId, AnyComponentInstance>();
    const started = new Set<AnyComponentInstance>();

    async function runHook(instance: AnyComponentInstance, operation: "start" | "stop"): Promise<void> {
        const scope = {active: true};
        try {
            const result = instance.definition[operation]?.(instance.contextForHook(scope));
            if(result != null) {
                await result;
            }
        } finally {
            // Saved call functions share this permission and lose it when the hook settles.
            scope.active = false;
        }
    }

    async function dispatchCall<TCall extends AnyComponentCallReference>(
        reference: TCall,
        input: unknown,
        scope: HookScope | null,
    ): Promise<CallOutput<TCall>> {
        const state = lifecycle.state;
        const during_transition = state === "starting" || state === "stopping";
        const from_hook = during_transition && scope?.active === true;
        if(state !== "active" && state !== "reloading" && !from_hook) {
            throw new LifecycleStateError(state, "call");
        }
        const {component_id, name} = reference;
        const entry = registry.calls_by_component_id.get(component_id)?.get(name);
        const target = instances.get(component_id);
        // The caller's types come from the supplied reference. The same ID and name can have different schemas.
        if(entry?.reference !== reference || target == null) {
            throw new UnregisteredCallError(component_id, name);
        }
        if(from_hook && !started.has(target)) {
            throw new LifecycleStateError(state, "call");
        }
        const context = from_hook ? target.contextForHook(scope) : target.context;
        return invokeCall(reference, entry.handler, context, input);
    }

    for(const component of registry.start_order) {
        const {id} = component.calls;
        function createCall(scope: HookScope | null): AnyComponentContext["call"] {
            return async (reference, input) => {
                const declared = component.uses.some(
                    ({id, calls}) => id === reference.component_id && Object.values(calls).includes(reference),
                );
                if(!declared) {
                    throw new UndeclaredCallError(id, reference.component_id, reference.name);
                }
                return dispatchCall(reference, input, scope);
            };
        }
        const context: AnyComponentContext = {
            log: logger(id),
            data: createDataAccess(data.resolve(id)),
            call: createCall(null),
            ...(component.state == null ? {} : {state: component.state()}),
        };
        instances.set(id, {
            definition: component,
            context,
            contextForHook: (scope) => ({...context, call: createCall(scope)}),
        });
    }

    return {
        data,
        logger,
        async start() {
            lifecycle.applyTransition("start", ["idle"], "starting");
            try {
                const prepared = [];
                for(const {definition, context} of instances.values()) {
                    const config = await loadComponentConfig(definition, config_dir, env);
                    const secrets = await loadComponentSecrets(definition, secrets_dir, env, context.log);
                    prepared.push({context, config, secrets});
                }
                for(const {context, config, secrets} of prepared) {
                    if(config !== null) {
                        context.config = config.value;
                        context.log.debug("Loaded configuration.");
                    }
                    if(secrets !== null) {
                        context.secrets = secrets.value;
                        context.log.debug("Loaded secrets.");
                    }
                }
                for(const instance of instances.values()) {
                    await runHook(instance, "start");
                    started.add(instance);
                    instance.context.log.debug("Component started.");
                }
            } catch (error) {
                lifecycle.applyTransition("start", ["starting"], "failed");
                throw error;
            }
            lifecycle.applyTransition("start", ["starting"], "active");
        },
        async stop() {
            lifecycle.applyTransition("stop", ["active", "failed"], "stopping");
            const errors: unknown[] = [];
            for(const instance of Array.from(started).reverse()) {
                started.delete(instance);
                try {
                    await runHook(instance, "stop");
                    instance.context.log.debug("Component stopped.");
                } catch (error) {
                    errors.push(error);
                }
            }
            lifecycle.applyTransition("stop", ["stopping"], "idle");
            if(errors.length > 0) {
                throw new AggregateError(errors, "One or more components failed to stop.");
            }
        },
        call(reference, input) {
            return dispatchCall(reference, input, null);
        },
    };
}
