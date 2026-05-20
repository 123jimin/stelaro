# TODO

1. Core component state (`t0004`)
   - Define and implement component-local state lifetime.
   - Needed by: web backend stateful services, chatbot conversation/session state, HMR state preservation.

2. Gateway model (`t0005`)
   - Define how gateway components bind external events to typed component calls.
   - Needed by: Fastify routes, Discord interactions/events, outbound gateway capabilities.

3. Application runtime lifecycle (`t0006`)
   - Start, stop, bind gateways, and report startup/shutdown failures.
   - Depends on: gateway model.
   - Needed by: real servers and long-running bots.

4. Component-scoped logging (`t0007`)
   - Provide logging through context with component identity.
   - Depends on: application runtime lifecycle.
   - Needed by: observable backends and debuggable bots.

5. Configuration (`t0008`)
   - Load and validate application/component configuration through schemas.
   - Depends on: application runtime lifecycle.
   - Needed by: environment-specific server and bot setup.

6. Fastify gateway package (`t0009`)
   - Implement HTTP route binding, request/body validation, response helpers, and outbound HTTP-facing capabilities.
   - Depends on: gateway model, lifecycle, logging, configuration.
   - Proves: full web server backend.

7. Discord gateway package (`t0010`)
   - Implement Discord event/interaction binding and typed outbound Discord capabilities.
   - Depends on: gateway model, lifecycle, logging, configuration.
   - Proves: rich Discord chatbot.

8. Resources and templates (`t0011`)
   - Define component-owned reusable assets such as prompts, views, and message templates.
   - Depends on: configuration.
   - Needed by: rich chatbot responses and web rendering.

9. Hot Module Replacement (`t0012`)
   - Replace behavior during development while preserving state only when explicitly supported.
   - Depends on: state, lifecycle, gateway model, resources/templates.

10. Production examples (`t0013`)
    - Make one full web backend and one rich Discord chatbot from public Stelaro APIs.
    - Depends on: Fastify gateway, Discord gateway, logging, configuration.
