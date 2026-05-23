# TODO

1. Signal handling
   - Opt-in helper that wires OS signals to `app.stop()` (double-signal, timeout, concurrent stop).
   - Part of: base stelaro (small utility).

2. Data directory / resource access
   - Component-scoped file loading from base directory (`{component_id}/data/`).
   - Already has `UNIMPLEMENTED` marker in s0019.
   - Part of: base stelaro.

3. Discord handler middleware and error handling (`t0025`)
   - Guards, rate limiting, error classification, partial fetching, concurrency control.
   - Depends on: Discord gateway.

4. Discord widget system (`t0024`)
   - Pagination, confirmation dialogs, streaming messages, rate-limited edits as opt-in helpers.
   - Depends on: Discord gateway.

5. Production examples (`t0013`)
   - Make one full web backend and one rich Discord chatbot from public Stelaro APIs.
   - Revisit scope given `t0026` already landed.
   - Depends on: Fastify gateway, Discord gateway, logging, configuration.

6. Scheduled tasks and background job queue
   - Scheduled: cron expressions, last-run tracking, missed-run recovery.
   - Job queue: event-triggered deferred work, concurrency control, retry.
   - Both need lifecycle management and optionally persistence.
   - Part of: component module (own package).

7. Hot Module Replacement (`t0012`)
   - Replace behavior during development while preserving state only when explicitly supported.
   - Depends on: state, lifecycle, gateway model.

8. gRPC gateway
   - Maps incoming RPC calls to component calls, same pattern as Fastify/Discord gateways.
   - Part of: future gateway package.
