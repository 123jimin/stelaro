+++
id = "t0034"
title = "Log HTTP requests through the gateway logger"
status = "cancelled"
tags = ["logging", "gateway", "fastify"]
modifies = ["s0016"]
blocked_by = []
+++

## Context

The fastify gateway logs its own lifecycle through `context.log` (t0033: `gateway.listening` /
`gateway.closed`), but per-request access logs are not covered. Today that leaves request
logging to Fastify's built-in logger, which the caller must wire to the application's backend —
and Fastify's logger can only be set at construction (caller-owned), so its records sit outside
the component-scoped stream that every other stelaro log shares.

Instead, the gateway should emit a per-request access log through its **own component logger**
(`context.log`), the same logger it already uses for lifecycle. Request logging is a
protocol-specific concern and belongs in the gateway package (s0001). The result: request logs
join the one component-scoped stream (tagged with the gateway's id), and a downstream app needs
no Fastify-logger wiring at all — it only provides the injected `LoggerFactory`.

## Scope

- In the gateway's `start()` hook (where `context.log` and the server are both in hand),
  register two coordinated Fastify hooks so each request yields exactly one access record
  through `context.log`:
  - `onError(request, reply, error)` — stash the thrown error on `request`. It fires before
    the response is sent and is the only hook carrying the error; it does NOT fire for a
    non-throwing 5xx (e.g. `reply.code(500).send(...)`), so it cannot be the sole emitter.
  - `onResponse(request, reply)` — emit the access record. It fires once per completed
    response (including 4xx/404) and carries the final status and timing. Fields:
    `method` (`request.method`), the matched route pattern (`request.routeOptions.url`,
    falling back to `request.url` when `request.is404` — `routeOptions.url` is `undefined`
    with no matched route), status code (`reply.statusCode`), elapsed time in ms
    (`reply.elapsedTime`), and the request id (`request.id`, which Fastify generates
    regardless of its own logger so request-scoped lines correlate).
- One stable event, `gateway.request`, with the level encoding the outcome (one event, level
  varies — as with the stop-failure logging, not a parallel failure event): log at `error`,
  carrying the stashed error when present, when a request threw or `reply.statusCode >= 500`;
  otherwise `info`. 4xx (including 404) log at `info`.
- The gateway does NOT enable or require Fastify's built-in request logging; access logs come
  from these hooks. Verbosity follows the injected logger's level.

## Out of scope

- The pino backend / its configuration — the caller owns the logger instance (s0025); the
  gateway logs through whatever `LoggerFactory` the application injected.
- Configuring Fastify's own built-in logger — an app may still set it independently for
  Fastify-native logging, but that is not how the gateway emits access logs.
- Body/header logging, sampling, redaction, and per-route log levels — later if needed.

## Notes

- Builds on t0033's pattern (the gateway logging through `context.log` from its start hook); no
  hard dependency (t0033 is done).
- Spec update is part of the work: s0016 gains "the gateway logs each completed request
  (method, route, status, elapsed time, request id) through its component logger; failures at
  error."
- Open decision (hook scope): `server.addHook(...)` is instance-global, so on a Fastify
  instance the gateway shares with non-gateway routes it would log those too. Either accept
  instance-global hooks (and document that the gateway assumes a dedicated instance) or attach
  the hooks per route in the existing route-registration loop (scoped to gateway-owned routes,
  including the gateway's own `routes`). Lean per-route if shared instances are supported.
- Access logs at `info` are high-frequency; confirm the level reads well in practice, since it
  is filtered by the injected logger's level rather than a separate switch (4xx/404 also flow
  through at `info`).
- Spec-derived test: drive a request with `server.inject({method, url})` (no socket needed)
  through a gateway started with a capturing `LoggerFactory`, then assert the `gateway.request`
  record's fields and level. The fake-server stand-in from the lifecycle test does not reach
  these hooks — they need real routing. Since hook registration currently lives in `start()`
  (which also calls `server.listen()`), the test must `start` (binds an ephemeral port 0) →
  `inject` → `stop`; separating hook/route registration from `listen()` would make this
  injectable without binding, and is HMR-adjacent.

## Cancellation

Cancelled in favour of delegating per-request logging to Fastify's native logger, unified into
the component-scoped stream via a shared pino `loggerInstance` set by the application when it
constructs the Fastify instance. The gateway-hook approach described above was rejected as
non-robust and redundant, and the gateway cannot set Fastify's logger anyway (construction-time;
the gateway receives a pre-built instance, s0016). Rationale and the adopted pattern: d0003;
s0016 carries the one-line clarification.
