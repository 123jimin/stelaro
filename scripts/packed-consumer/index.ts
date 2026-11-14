import {deepEqual} from "node:assert/strict";

import {createApplication, defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {definePinoLogger} from "@jiminp/stelaro-pino";
import {type} from "arktype";
import pino from "pino";

const messages: unknown[] = [];
const logger = definePinoLogger(pino({base: null, timestamp: false}, {
    write(line) {
        messages.push(JSON.parse(line));
    },
}));
const calls = defineComponentCalls("greeter", {
    greet: {input: type({name: "string"}), output: type({message: "string"})},
});
const greeter = defineComponent({
    calls,
    uses: [],
    start({log}) {
        log.info("Starting");
    },
    handlers: {
        greet({log}, {name}) {
            log.info({name}, "Greeting");
            return {message: `Hello, ${name}!`};
        },
    },
    stop({log}) {
        log.info("Stopping");
    },
});

const app = createApplication({components: [greeter], logger});
await app.start();
try {
    const result = await app.call(calls.calls.greet, {name: "world"});
    // @ts-expect-error The declared output only exposes message.
    type _InvalidMessage = typeof result["missing"];
    deepEqual(result.message, "Hello, world!");
} finally {
    await app.stop();
}

deepEqual(messages, [
    {level: 30, component: "greeter", msg: "Starting"},
    {level: 30, component: "greeter", name: "world", msg: "Greeting"},
    {level: 30, component: "greeter", msg: "Stopping"},
]);
