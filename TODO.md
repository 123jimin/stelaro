# TODO

1. Hot Module Replacement (`t0012`)
   - Replace behavior during development while preserving state only when explicitly supported.
   - Depends on: state, lifecycle, gateway model.

2. Production examples (`t0013`)
   - Make one full web backend and one rich Discord chatbot from public Stelaro APIs.
   - Depends on: Fastify gateway, Discord gateway, logging, configuration.

3. Discord widget system (`t0024`)
   - Pagination, confirmation dialogs, streaming messages, rate-limited edits as opt-in helpers.
   - Depends on: Discord gateway.

4. Discord handler middleware and error handling (`t0025`)
   - Guards, rate limiting, error classification, partial fetching, concurrency control.
   - Depends on: Discord gateway.
