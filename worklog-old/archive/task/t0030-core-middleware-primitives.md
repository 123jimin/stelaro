+++
id = "t0030"
title = "Core middleware primitives"
status = "done"
tags = ["util", "errors", "application"]
modifies = ["s0007"]
blocked_by = []
+++

## Objective

Add gateway-agnostic middleware primitives to the core stelaro package: a keyed rate limiter, a keyed concurrency limiter, and a user-facing error class. These are prerequisites for gateway-specific middleware (t0025, and future Fastify/gRPC equivalents).

## Scope

### 1. Keyed rate limiter (`src/util/rate-limiter.ts`)

Sliding-window rate limiter keyed by arbitrary string. Synchronous check — returns whether the call is allowed.

```ts
type RateLimiter = {
    check(key: string): boolean;
};

function createRateLimiter(limit: number, window_ms: number): RateLimiter;
```

- `check` returns `true` if the call is within the limit, `false` otherwise.
- Tracks timestamps per key in a sliding window.
- Expired entries are pruned lazily on `check`.

### 2. Keyed concurrency limiter (`src/util/concurrency-limiter.ts`)

Keyed semaphore that queues excess callers. `acquire` resolves when a slot opens; returns a release function. One-at-a-time is `max_concurrent: 1`.

```ts
type ConcurrencyLimiter = {
    acquire(key: string): Promise<() => void>;
};

function createConcurrencyLimiter(max_concurrent: number): ConcurrencyLimiter;
```

- `acquire` resolves immediately if slots are available.
- `acquire` queues and resolves in FIFO order when at capacity.
- The returned function releases the slot.

### 3. User-facing error class (`src/error.ts`)

Signals that the error message is safe and intended to be shown to the end user. Each gateway decides how to present it (Discord: ephemeral reply, Fastify: HTTP 4xx body).

```ts
class UserFacingError extends StelaroError {
    readonly user_message: string;
    constructor(user_message: string);
}
```

- Extends `StelaroError`.
- `user_message` is the string safe to display to end users.

### Spec updates

- s0007: Add `UserFacingError` to the error catalog.
- New specs may be needed for rate limiter and concurrency limiter (evaluate during implementation).

## Out of Scope

- Gateway-specific integration (guards, key extractors, dispatch changes) — those belong to t0025 and future gateway tasks.
- Persistent rate limiting (e.g., Redis-backed).
- Distributed concurrency control.
