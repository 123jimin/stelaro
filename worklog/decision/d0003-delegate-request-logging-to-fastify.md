+++
id = "d0003"
title = "Delegate gateway request logging to Fastify; unify via shared pino"
relates_to = ["s0016", "s0025"]
supersedes = []
+++

## Context

t0034 proposed that the Fastify gateway emit per-request access logs through its own component
logger (`context.log`) using Fastify lifecycle hooks (`onError` to capture the error, then
`onResponse` to emit), so request logs would join the one component-scoped stream without the
caller wiring Fastify's logger. Two approaches were weighed:

- **Gateway hooks** — register `onError`/`onResponse` in the gateway start hook and emit a
  `gateway.request` record via `context.log`. Generic across any `LoggerFactory`.
- **Fastify `loggerInstance`** — let Fastify's native request logging do the work, fed by a
  pino logger shared with stelaro.

## Choice

Delegate per-request logging to Fastify's native logger. The gateway emits no access logs. An
application unifies request logs into the component-scoped stream by constructing the Fastify
instance with `loggerInstance` set to a child of the shared pino backend (the same root used by
`definePinoLogger`, s0025), tagged with the gateway's id. **t0034 is cancelled.**

## Rationale

- Fastify's `loggerInstance` requires a pino-shaped `FastifyBaseLogger` (`level`, `child()`, the
  seven pino levels, pino's `(mergeObject, msg)` convention). Stelaro's core `Logger` (s0004) is
  the minimal `{debug,info,warn,error}` variadic and does not satisfy it; a generic
  `LoggerFactory → FastifyBaseLogger` shim would reimplement pino poorly. The clean bridge exists
  only at the pino layer — which stelaro-pino (s0025) already is.
- Fastify's logger is construction-time only, and the gateway *receives* a pre-built instance
  (s0016: "does not create its own"). The gateway therefore cannot set `loggerInstance`; only the
  caller who constructs the instance can. Request logging is application wiring, not gateway
  behavior.
- Fastify's native request logging is robust and battle-tested (req/res/error handling,
  `request.id` correlation, serializers). Hand-rolling it via hooks — including the
  `onError`-stash + `onResponse`-emit coordination and an instance-global hook on a possibly
  shared instance — is fragile and redundant.

## Consequences

- The gateway logs only its own lifecycle (`gateway.listening` / `gateway.closed`, t0033), never
  requests. s0016 gains a one-line note that request logging is delegated to Fastify and unified
  via `loggerInstance`.
- Unification is pino-specific: with the default console logger there is no pino to hand Fastify,
  so request logs do not join the stelaro stream (such apps use `Fastify({logger: true})` for
  their own dev request logs). Acceptable — pino is the production backend; console is the dev
  default.
- A reference example demonstrating the shared-pino wiring may be added later if a need emerges;
  it is not required by this decision.
