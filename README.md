# @jiminp/stelaro

**Stelaro** is a typed component system for Node.js applications.
Each component declares APIs with input/output schemas validated by [ArkType](https://arktype.io/).
Gateway packages for [Fastify](https://fastify.dev/) and [Discord.js](https://discord.js.org/) route external requests into component handlers.

## Quick Start

Define a component with a typed call surface:

```ts
import { createApplication, defineComponent, defineComponentCalls } from "@jiminp/stelaro";
import { type as schema } from "arktype";

// 1. Declare the call surface — typed input/output schemas.
const GreeterCalls = defineComponentCalls({
    id: "greeter",
    calls: {
        greet: {
            input: schema({ name: "string" }),
            output: schema({ message: "string" }),
        },
    },
});

// 2. Implement the component — one handler per declared call.
const GreeterComponent = defineComponent({
    calls: GreeterCalls,
    uses: [],
    handlers: {
        greet: {
            handle(_context, input) {
                return { message: `Hello, ${input.name}!` };
            },
        },
    },
});

// 3. Create an application and start.
const app = createApplication({ components: [GreeterComponent] });
await app.start();

// 4. Call through the typed reference — input and output are validated.
const result = await app.call(GreeterCalls.calls.greet, { name: "world" });
console.log(result.message); // "Hello, world!"
```

Components declare which other components they depend on via `uses`.
The runtime topologically sorts components at startup, so dependencies start first and stop last.

### Packages

| Package | Description |
| --- | --- |
| `@jiminp/stelaro` | Core component system |
| `@jiminp/stelaro-fastify` | Fastify gateway |
| `@jiminp/stelaro-discord` | Discord.js gateway |
| `@jiminp/stelaro-pino` | Pino logger adapter |

## Documentation

API reference is available at <https://123jimin.github.io/stelaro/>.

## Development

This project uses [pnpm](https://pnpm.io/) for package management.

- `pnpm build` – compile TypeScript packages from `src/` into `dist/`.
  - `pnpm build:watch` – recompile the core package on every file change.
- `pnpm test` – run package unit tests from `dist/**/*.spec.js`.
  - Don't forget to run `pnpm build` before running tests!
- `pnpm lint` – run ESLint on the source code.
- `pnpm clean` – remove the `dist/` directory.

## License

[MIT](./LICENSE)
