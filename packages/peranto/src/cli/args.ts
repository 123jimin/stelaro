import {resolve} from "node:path";
import {parseArgs as nodeParseArgs} from "node:util";

export type ParsedArgs = {
    readonly config_dir: string | undefined;
};

function resolvePath(value: string | undefined): string | undefined {
    return value != null ? resolve(value) : value;
}

export function parseArgs(argv?: string[]): ParsedArgs {
    const {values} = nodeParseArgs({
        args: argv ?? process.argv.slice(2),
        options: {
            "config-dir": {
                type: "string",
            },
        },
        strict: true,
        allowPositionals: false,
    });

    return {
        config_dir: resolvePath(values["config-dir"]),
    };
}
