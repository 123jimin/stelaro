import {parseArgs as nodeParseArgs} from "node:util";

/**
 * Parsed CLI arguments for application bootstrap.
 *
 * @category Application
 */
export type ParsedArgs = {
    /** Base directory as given, or `null` if not specified */
    readonly base_dir: string | null;
    /** Config directory as given, or `null` if not specified */
    readonly config_dir: string | null;
    /** Secrets directory as given, or `null` if not specified */
    readonly secrets_dir: string | null;
    /** Data directory as given, or `null` if not specified */
    readonly data_dir: string | null;
    /** Environment name for config/secrets overlay selection */
    readonly env: string | null;
};

/**
 * Parses CLI arguments into application bootstrap options.
 *
 * Recognizes `--base-dir`, `--config-dir`, `--secrets-dir`, `--data-dir`, and `--env` flags.
 *
 * @param argv - Argument array (default: `process.argv.slice(2)`)
 * @returns Parsed arguments
 * @throws {TypeError} If an unknown option, a positional argument, or an option without a value is supplied
 * @category Application
 */
export function parseArgs(argv?: string[]): ParsedArgs {
    const {values} = nodeParseArgs({
        args: argv ?? process.argv.slice(2),
        options: {
            "base-dir": {
                type: "string",
            },
            "config-dir": {
                type: "string",
            },
            "secrets-dir": {
                type: "string",
            },
            "data-dir": {
                type: "string",
            },
            "env": {
                type: "string",
            },
        },
        strict: true,
        allowPositionals: false,
    });

    return {
        base_dir: values["base-dir"] ?? null,
        config_dir: values["config-dir"] ?? null,
        secrets_dir: values["secrets-dir"] ?? null,
        data_dir: values["data-dir"] ?? null,
        env: values["env"] ?? null,
    };
}
