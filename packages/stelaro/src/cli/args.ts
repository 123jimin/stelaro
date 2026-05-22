import {resolve} from "node:path";
import {parseArgs as nodeParseArgs} from "node:util";

/** @category Application */
export type ParsedArgs = {
    readonly base_dir: string | undefined;
    readonly env: string | null;
};

function resolvePath(value: string | undefined): string | undefined {
    return value != null ? resolve(value) : value;
}

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
