+++
id = "s0032"
title = "Utilities"
tags = ["util"]
paths = ["packages/stelaro/src/util/rate-limiter.ts", "packages/stelaro/src/util/concurrency-limiter.ts"]
+++

## Types

```typescript
type RateLimiter = {
    check(key: string): boolean;
};

type ConcurrencyLimiter = {
    acquire(key: string): Promise<() => void>;
};

function createRateLimiter(limit: number, window_ms: number): RateLimiter;
function createConcurrencyLimiter(max_concurrent: number): ConcurrencyLimiter;
```

## Behavior

### Rate limiter

- `createRateLimiter` throws `RangeError` unless `limit` is a positive integer
  and `window_ms` a positive finite number.
- `check(key)` counts the call and returns `true` if fewer than `limit` calls
  for `key` are counted; otherwise it returns `false` without counting.
- A counted call stops counting `window_ms` after it was counted (a sliding
  window). Time is monotonic: wall-clock changes do not affect windows.

### Concurrency limiter

- `createConcurrencyLimiter` throws `RangeError` unless `max_concurrent` is a
  positive integer.
- `acquire(key)` resolves to a release function once the caller holds one of
  `key`'s `max_concurrent` slots. While every slot is held, acquires wait
  without a timeout and are granted in call order.
- A release function frees its slot on the first call and ignores later calls.
