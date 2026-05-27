import {resolve} from "node:path";
import {parseArgs as nodeParseArgs} from "node:util";

/**
 * Parsed CLI arguments for application bootstrap.
 *
 * @category Application
 */
export type ParsedArgs = {
    /** Resolved base directory path, or `undefined` if not specified */
    readonly base_dir: string | undefined;
    /** Environment name for config/secrets overlay selection */
    readonly env: string | null;
};

function resolvePath(value: string | undefined): string | undefined {
    return value != null ? resolve(value) : value;
}

/**
 * Parses CLI arguments into application bootstrap options.
 *
 * Recognizes `--base-dir` and `--env` flags.
 *
 * @param argv - Argument array (default: `process.argv.slice(2)`)
 * @returns Parsed arguments
 * @category Application
 */
export function parseArgs(argv?: string[]): ParsedArgs {
    const {values} = nodeParseArgs({
        args: argv ?? process.argv.slice(2),
        options: {
            "base-dir": {
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
        base_dir: resolvePath(values["base-dir"]),
        env: values["env"] ?? null,
    };
}
