import type {Promisable} from "@jiminp/tooltool";

import type {ComponentCallFn, ComponentId} from "../component/calls.ts";
import type {AnyComponent} from "../component/definition.ts";
import type {LoggerFactory} from "../component/logger.ts";
import {consoleLoggerFactory} from "../component/logger.ts";
import type {DataAccess} from "../data/access.ts";
import {createDataAccess} from "../data/access.ts";
import type {AnyComponentInstance, DispatchCall} from "./component-instance.ts";
import {createComponentInstance} from "./component-instance.ts";
import {resolveApplicationDirectories} from "./directories.ts";
import {UnregisteredCallError, UnregisteredComponentError} from "./error.ts";
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
     * Reload all component configurations, then run the component and application reload hooks.
     *
     * @returns A promise that resolves when all reload hooks complete
     * @throws {LifecycleStateError} The application is outside the active state.
     * @throws {ConfigFileError} A required configuration file is missing or cannot be read or parsed.
     * @throws {ConfigValidationError} A component's configuration fails its schema.
     * @throws {AggregateError} One or more component reload hooks failed.
     */
    reloadConfig(): Promise<void>;

    /**
     * Reload one component's configuration and run its reload hook.
     *
     * @param component_id - ID of a registered component
     * @returns A promise that resolves when the component's reload hook completes
     * @throws {LifecycleStateError} The application is outside the active state.
     * @throws {UnregisteredComponentError} The component ID is unregistered.
     * @throws {ConfigFileError} A required configuration file is missing or cannot be read or parsed.
     * @throws {ConfigValidationError} The configuration fails the component's schema.
     */
    reloadComponentConfig(component_id: TComponents[number]["calls"]["id"]): Promise<void>;

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
    const registry = createComponentRegistry(definition.components);
    const {config_dir, secrets_dir, data_dir} = resolveApplicationDirectories(options);
    const env = options.env ?? null;
    const logger = definition.logger ?? consoleLoggerFactory;
    const data = createDataAccess(data_dir);
    const lifecycle = createLifecycleMachine();

    // Iteration order is the dependency order of the registry, which is preserved by Map.
    const instances = new Map<ComponentId, AnyComponentInstance>();

    // Just to track the started components for shutdown in reverse order.
    const started_components: AnyComponentInstance[] = [];

    const dispatchCall: DispatchCall = async (reference, input, scope) => {
        const state = lifecycle.state;
        const from_hook = (state === "starting" || state === "stopping") && scope?.active === true;
        if(state !== "active" && state !== "reloading" && !from_hook) {
            throw new LifecycleStateError(state, "call");
        }
        const {component_id, name} = reference;
        const target = instances.get(component_id);
        if(target == null) {
            throw new UnregisteredCallError(component_id, name);
        }
        if(from_hook && !target.is_started) {
            throw new LifecycleStateError(state, "call");
        }
        return target.invoke(reference, input, from_hook ? scope : null);
    };

    // Preserve the registry's dependency order for startup.
    for(const [id, {definition, calls}] of registry) {
        instances.set(id, createComponentInstance(definition, calls, logger(id), createDataAccess(data.resolve(id)), dispatchCall));
    }

    async function loadAndInstallConfiguration(targets: Iterable<AnyComponentInstance>, secrets_dir: string | null): Promise<void> {
        const prepared = await Promise.all(Array.from(targets, async (instance) => ({
            instance, configuration: await instance.loadConfiguration(config_dir, env, secrets_dir),
        })));
        for(const {instance, configuration} of prepared) {
            instance.installConfiguration(configuration);
        }
    }

    async function runReloadHooks(): Promise<void> {
        const results = await Promise.allSettled(Array.from(instances.values(), (instance) => instance.runConfigReloadHook()));
        const errors: unknown[] = [];
        for(const result of results) {
            if(result.status === "rejected") {
                errors.push(result.reason);
            }
        }
        if(errors.length > 0) {
            throw new AggregateError(errors, "One or more component configuration reload hooks failed.");
        }
        await definition.onConfigReload?.();
    }

    async function reload(component_id: ComponentId | null): Promise<void> {
        const operation = component_id === null ? "reloadConfig" : "reloadComponentConfig";
        lifecycle.applyTransition(operation, ["active"], "reloading");
        let failure_state: "active" | "failed" = "active";
        try {
            const instance = component_id === null ? null : instances.get(component_id) ?? null;
            if(component_id !== null && instance === null) {
                throw new UnregisteredComponentError(component_id);
            }
            await loadAndInstallConfiguration(instance === null ? instances.values() : [instance], null);
            failure_state = "failed";
            if(instance === null) {
                await runReloadHooks();
            } else {
                await instance.runConfigReloadHook();
            }
        } catch (error) {
            lifecycle.applyTransition(operation, ["reloading"], failure_state);
            throw error;
        }
        lifecycle.applyTransition(operation, ["reloading"], "active");
    }

    return {
        data,
        logger,
        async start() {
            lifecycle.applyTransition("start", ["idle"], "starting");
            try {
                await loadAndInstallConfiguration(instances.values(), secrets_dir);
                for(const instance of instances.values()) {
                    await instance.runHook("start");
                    started_components.push(instance);
                    instance.log.debug("Component started.");
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
            for(let instance = started_components.pop(); instance != null; instance = started_components.pop()) {
                try {
                    await instance.runHook("stop");
                    instance.log.debug("Component stopped.");
                } catch (error) {
                    errors.push(error);
                }
            }
            lifecycle.applyTransition("stop", ["stopping"], "idle");
            if(errors.length > 0) {
                throw new AggregateError(errors, "One or more components failed to stop.");
            }
        },
        reloadConfig() {
            return reload(null);
        },
        reloadComponentConfig(component_id) {
            return reload(component_id);
        },
        call(reference, input) {
            return dispatchCall(reference, input, null);
        },
    };
}
