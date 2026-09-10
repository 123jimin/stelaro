+++
id = "t0006"
title = "Log HTTP requests through the gateway logger"
tags = ["logging", "gateway", "fastify"]
modifies = ["s0016"]
status = "cancelled"
+++

# Log HTTP requests through the gateway logger (NEEDS APPROVAL)

## Outcome

Cancelled. Access logging remains Fastify's responsibility. An application may
construct its Fastify instance with a gateway-id-tagged child `loggerInstance`
from the same Pino backend used by Stelaro's `LoggerFactory`, producing one
component-scoped stream without gateway-owned request hooks.

## Rejected Approach

Do not add gateway-level `onError` and `onResponse` hooks that emit one
`gateway.request` event with method, matched route, status, elapsed time,
request id, and any thrown error. The gateway receives a pre-built Fastify
instance and cannot configure its construction-time logger; instance-wide hooks
would also capture unrelated routes on a shared server. This approach was
therefore considered redundant and insufficiently robust.

`s0016` records the adopted ownership and integration pattern.

Cancellation reason: Fastify native access logging is the adopted integration; gateway-owned request hooks are redundant and non-robust.
