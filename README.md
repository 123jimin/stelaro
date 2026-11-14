# Stelaro

**Stelaro** is a typed component system for Node.js applications.
Each component declares APIs with input/output schemas validated by [ArkType](https://arktype.io/).

| Package | Description |
| --- | --- |
| `@jiminp/stelaro` | Component definitions, typed calls, configuration, and application lifecycle |
| `@jiminp/stelaro-pino` | Adapter for a caller-configured Pino logger |

## Quick Start

Install the core package and ArkType in a Node.js project using ES modules.
The example imports ArkType directly to define input and output schemas.

```sh
pnpm add @jiminp/stelaro arktype
```

Define a component, start the application, and call the component through its typed reference.

```ts
import {createApplication, defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {type} from "arktype";

const GreeterCalls = defineComponentCalls("greeter", {
    greet: {
        input: type({name: "string"}),
        output: type({message: "string"}),
    },
});

const GreeterComponent = defineComponent({
    calls: GreeterCalls,
    uses: [],
    handlers: {
        greet: (_context, input) => ({message: `Hello, ${input.name}!`}),
    },
});

const app = createApplication({components: [GreeterComponent]});
await app.start();
try {
    const result = await app.call(GreeterCalls.calls.greet, {name: "world"});
    console.log(result.message); // Hello, world!
} finally {
    await app.stop();
}
```

Components declare which other components they depend on via `uses`.
`createApplication` validates the dependency graph and sorts components topologically, so dependencies start first and stop last.

## Logging with Pino

Install the adapter and Pino alongside core.

```sh
pnpm add @jiminp/stelaro-pino pino@^10.4.0
```

Pass a configured Pino root to `definePinoLogger` and use the result as the application's logger factory.
Component logs inherit the root configuration and carry the component ID in the `component` field.

```ts
import {createApplication, defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {definePinoLogger} from "@jiminp/stelaro-pino";
import pino from "pino";

const worker = defineComponent({
    calls: defineComponentCalls("worker", {}),
    uses: [],
    handlers: {},
    start({log}) {
        log.info("Worker started");
    },
});

const logger = definePinoLogger(pino({level: "info"}));
const app = createApplication({components: [worker], logger});
await app.start();
await app.stop();
```

## Documentation

See the [API reference](https://123jimin.github.io/stelaro/).

## Development

This project uses [pnpm](https://pnpm.io/) for package management.

- `pnpm build` compiles both packages into their `dist/` directories.
- `pnpm test` builds and runs the package tests.
- `pnpm test:packed` verifies the built tarballs in a separate consumer after `pnpm build`.
- `pnpm lint` runs ESLint on the package sources.
- `pnpm build-docs` generates the API reference in `docs/` after `pnpm build`.
- `pnpm clean` removes compiled package output.

## License

[MIT](./LICENSE)
