# TODO

1. Discord gateway package (`t0010`)
   - Implement Discord event/interaction binding and typed outbound Discord capabilities.
   - Depends on: gateway model, lifecycle, logging, configuration.
   - Proves: rich Discord chatbot.

2. Resources and templates (`t0011`)
   - Define component-owned reusable assets such as prompts, views, and message templates.
   - Depends on: configuration.
   - Needed by: rich chatbot responses and web rendering.

3. Hot Module Replacement (`t0012`)
   - Replace behavior during development while preserving state only when explicitly supported.
   - Depends on: state, lifecycle, gateway model, resources/templates.

4. Production examples (`t0013`)
   - Make one full web backend and one rich Discord chatbot from public Stelaro APIs.
   - Depends on: Fastify gateway, Discord gateway, logging, configuration.
