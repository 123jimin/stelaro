# TODO

1. ~~Signal handling~~ (`s0020`) — Done.

2. ~~Data directory / resource access~~ (`s0021`, `s0022`) — Done.
   - `DataAccess` with `dir`, `resolve`, `read`, `write` on `context.data` and `app.data`.
   - Fluent FS util (`s0022`): `FluentPath` with `join`/`confine`, `FileReader` with `optional()` + schema validation, `FileWriter` with auto-mkdir.

3. ~~Discord handler middleware and error handling~~ (`s0017`) — Done.
   - Guards (gateway/mount/handler levels), rate limiting, concurrency limiting, auto-fetch partials.
   - `UserFacingError` → ephemeral reply. Event handler isolation via `Promise.allSettled`.
   - Key extractors: `perUser`, `perGuild`, `perChannel`.

4. Discord widget system (`t0004`)
   - Pagination, confirmation dialogs, streaming messages, rate-limited edits as opt-in helpers.
   - Depends on: Discord gateway.

5. Unified reply context for Discord handlers (`t0005`)
   - One lightweight reply interface for Discord handlers, keeping direct access to raw discord.js objects.
   - Depends on: Discord gateway.

6. Production examples (`t0003`)
   - Make one full web backend and one rich Discord chatbot from public Stelaro APIs.
   - Depends on: Fastify gateway, Discord gateway, logging, configuration.

7. Scheduled tasks and background job queue
   - Scheduled: cron expressions, last-run tracking, missed-run recovery.
   - Job queue: event-triggered deferred work, concurrency control, retry.
   - Both need lifecycle management and optionally persistence.
   - Part of: component module (own package).

8. Hot Module Replacement (`t0002`)
   - Replace behavior during development while preserving state only when explicitly supported.
   - Depends on: state, lifecycle, gateway model.

9. gRPC gateway
   - Maps incoming RPC calls to component calls, same pattern as Fastify/Discord gateways.
   - Part of: future gateway package.
