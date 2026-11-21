import {join, resolve} from "node:path";
import process from "node:process";

import {attachSignalHandlers, parseArgs} from "@jiminp/stelaro";

import {createBbsApplication} from "./app.ts";

const example_root = resolve(import.meta.dirname, "..");

/** Start the Fastify BBS example from CLI arguments and attach graceful shutdown signals. */
export async function runMain(argv?: string[]) {
    const args = parseArgs(argv);
    const application_options = args.base_dir == null && args.config_dir == null
        ? {...args, config_dir: join(example_root, "config")}
        : args;
    const {app, server, passport} = createBbsApplication({application_options});
    const detachSignals = attachSignalHandlers(app);
    try {
        await app.start();
    } catch (error) {
        detachSignals();
        throw error;
    }
    return {app, server, passport, detachSignals};
}

if(process.argv[1] != null && resolve(process.argv[1]) === import.meta.filename) {
    await runMain();
}
