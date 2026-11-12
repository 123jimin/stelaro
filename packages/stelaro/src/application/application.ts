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
