import {parseArgs as parseNodeArgs} from "node:util";

/**
 * Startup overrides parsed from the core command-line flags.
 *
 * @typeParam TEnv - Environment names after any caller validation (default: `string`)
 *
 * @category Application
 */
export type ParsedArgs<TEnv extends string = string> = {
    /** The supplied `--base-dir` value, or `null` if omitted. */
    readonly base_dir: string | null;
    /** The supplied `--config-dir` value, or `null` if omitted. */
    readonly config_dir: string | null;
    /** The supplied `--secrets-dir` value, or `null` if omitted. */
    readonly secrets_dir: string | null;
    /** The supplied `--data-dir` value, or `null` if omitted. */
    readonly data_dir: string | null;
    /** The supplied `--env` value, or `null` if omitted. */
    readonly env: TEnv | null;
};

/**
 * Parse the fixed application flags into startup overrides.
 *
 * @param argv - Command-line arguments after the executable and script (default: `process.argv.slice(2)`)
 * @returns The supplied strings and `null` for omitted flags
 * @throws {TypeError} An argument is unknown or positional, or a flag is missing a value.
 *
 * @remarks
 * Validate the returned `env` before using it with a narrower environment type.
 *
 * @example
 * ```typescript
 * import {parseArgs} from "@jiminp/stelaro";
 *
 * const options = parseArgs(["--base-dir", "./service", "--env=production"]);
 * ```
 *
 * @see {@link ApplicationOptions}
 * @category Application
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs<string> {
    const {values} = parseNodeArgs({
        args: argv,
        options: {
            "base-dir": {type: "string"},
            "config-dir": {type: "string"},
            "secrets-dir": {type: "string"},
            "data-dir": {type: "string"},
            "env": {type: "string"},
        },
    });

    return {
        base_dir: values["base-dir"] ?? null,
        config_dir: values["config-dir"] ?? null,
        secrets_dir: values["secrets-dir"] ?? null,
        data_dir: values["data-dir"] ?? null,
        env: values.env ?? null,
    };
}
