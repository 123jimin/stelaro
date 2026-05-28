---
title: Getting Started
---

# Getting Started

Stelaro is an opinionated TypeScript component system. Its goal is maintainability: each part of an application can be understood and changed independently, even as the application grows. It achieves this through components with enforced boundaries — typed call schemas, explicit dependency declarations, and scoped configuration.

## Installation

Stelaro requires ESM (`"type": "module"` in package.json) and TypeScript with `module: "NodeNext"`.

```bash
pnpm add @jiminp/stelaro arktype
```

## Define a Component

A component has two parts: a **call surface** (what it exposes) and a **definition** (how it handles those calls). Call surfaces are defined with [ArkType](https://arktype.io/) schemas that validate input and output at runtime.

```ts
// src/greeter.ts
import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";

export const GreeterCalls = defineComponentCalls("greeter", {
    greet: {
        input: schema({name: "string"}),
        output: schema({message: "string"}),
    },
});

export const GreeterComponent = defineComponent({
    calls: GreeterCalls,
    uses: [],
    handlers: {
        greet: {
            handle(_context, input) {
                return {message: `Hello, ${input.name}!`};
            },
        },
    },
});
```

`GreeterCalls` is the public surface that other components and gateways import to reference `greet`. The schemas validate input and output at every call boundary automatically.

## Add a Fastify Gateway

A gateway connects components to the outside world. Install the Fastify gateway and Fastify itself:

```bash
pnpm add @jiminp/stelaro-fastify fastify
```

Route groups are co-located with the component they serve. Add `GreeterRoutes` to the component file:

```ts
// src/greeter.ts (add to the end)
import {defineFastifyRoutes, route} from "@jiminp/stelaro-fastify";

export const GreeterRoutes = defineFastifyRoutes({
    uses: [GreeterCalls],
    routes: [
        route({
            method: "GET",
            path: "/greet/:name",
            params: schema({name: "string"}),
            async handle({params, call}) {
                return call(GreeterCalls.calls.greet, {name: params.name});
            },
        }),
    ],
});
```

The route group declares `uses: [GreeterCalls]` — it can only call what it declares. The `params` schema validates the URL parameter before the handler runs.

The gateway composes route groups from components — it doesn't define routes itself:

```ts
// src/gateway.ts
import {defineFastifyGateway} from "@jiminp/stelaro-fastify";
import Fastify from "fastify";

import {GreeterRoutes} from "./greeter.ts";

const server = Fastify();

export const Gateway = defineFastifyGateway({
    id: "http",
    server,
    uses: [],
    mounts: [GreeterRoutes],
});
```

## Create and Start the Application

```ts
// src/index.ts
import {createApplication, defineApplication} from "@jiminp/stelaro";

import {Gateway} from "./gateway.ts";
import {GreeterComponent} from "./greeter.ts";

const App = defineApplication({
    components: [GreeterComponent, Gateway],
});

const app = createApplication(App, {base_dir: "app"});
await app.start();
```

The Fastify gateway reads its port from config. Create `app/http/config.toml`:

```toml
port = 3000
```

Run the application and test:

```bash
$ curl http://localhost:3000/greet/world
{"message":"Hello, world!"}
```

The application validates the component graph (no missing dependencies, no cycles), starts components in dependency order, and dispatches calls through validated boundaries.

## Add Configuration

Components can declare a config schema. The framework loads and validates TOML config files on startup.

```ts
// src/greeter.ts (updated)
import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";

export const GreeterCalls = defineComponentCalls("greeter", {
    greet: {
        input: schema({name: "string"}),
        output: schema({message: "string"}),
    },
});

const GreeterConfig = schema({
    prefix: "string",
});

export const GreeterComponent = defineComponent({
    calls: GreeterCalls,
    uses: [],
    config: GreeterConfig,
    handlers: {
        greet: {
            handle(context, input) {
                return {message: `${context.config.prefix}, ${input.name}!`};
            },
        },
    },
});
```

Create `app/greeter/config.toml`:

```toml
prefix = "Hello"
```

Environment-specific overlays (e.g., `greeter/config.dev.toml`) are deep-merged onto the base file when `--env dev` is passed. Secrets work the same way with `secrets.toml`.

## Next Steps
