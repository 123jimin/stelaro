+++
id = "t0025"
title = "Implement Fastify example routes and authentication"
status = "done"
tags = ["examples", "gateway", "fastify", "config", "logging"]
modifies = ["s0003", "s0016", "s0017", "s0020", "s0021"]
blocked_by = ["t0020", "t0024"]
+++

# Implement Fastify example routes and authentication

Complete the BBS example in s0021 using the gateway from t0020 and domain components from t0024.
Use only public Stelaro APIs and the exact routes and authentication methods specified in s0021.
Discord OAuth is an authentication provider in this Fastify example and does not require a Discord gateway package.

## Completion criteria

- Implement every listed route: thread listing and detail, the authenticated new-thread form, thread/comment creation, the login-method page, Google and Discord OAuth entry/callback routes, ID login, and logout.
- Configure `@fastify/passport`, provider strategies with mock credentials, and in-memory sessions outside the gateway definition.
  Follow the reviewed dependency list and review rules in s0003.
- Verify equal ID-login names resolve to the same user without a password or secret, creation uses the session user, protected actions require authentication, logout ends the session, and sessions do not survive restart.
  Test provider wiring with mocks without requiring live OAuth credentials.
- Co-locate index/thread route groups in `threads`, comment routes in `comments`, and authentication routes in `auth`.
  Keep the gateway a thin composition of mounts, with native Fastify objects and standard route options passed through.
- Demonstrate typed calls, component state, gateway integration, logging, and validated configuration through natural use as required by s0020.
  Keep actual credentials and environment-specific assumptions out of the example.
- Document and smoke-test the runnable public entry point and secretless ID-login flow.
  Verify the storage, ordering, immutability, and lack of pagination specified in s0021 through HTTP.
- Pass `pnpm build`, `pnpm lint`, and `pnpm test` with the completed example included.

## Verification

- Dependencies checked under s0003: `@jiminp/stelaro-fastify` and `@jiminp/stelaro-pino` use `workspace:*`; `fastify` (`^5.12.8`), `pino` (`^10.4.0`), `@fastify/cookie` (`^11.1.5`), `@fastify/formbody` (`^9.0.2`), `@fastify/passport` (`^4.0.4`), and `@fastify/session` (`^11.2.1`) meet the 12-month release and 50,000+ weekly download thresholds; `passport-google-oauth20` (`^2.0.0`) and `discord-strategy` (`^2.5.0`) are listed in s0003's reviewed dependencies.
  Local ambient declarations in `src/passport-strategies.d.ts` avoid adding unreviewed `@types/*` packages.
- Implemented all s0021 routes co-located in `src/threads/index.ts`, `src/comments.ts`, and `src/auth.ts`, composed by the thin gateway in `src/gateway.ts` with validated `config/web.toml` (`WebConfig`) and unified Pino logging (`definePinoLogger` / `childPinoLogger("web")`).
- Configured `@fastify/cookie`, `@fastify/formbody`, in-memory `@fastify/session` (ephemeral per-process secret), and `@fastify/passport` (Google and Discord mock strategies) outside the gateway definition in `src/auth.ts`.
- Documented the runnable entry point (`src/main.ts` / `dist/main.js`) and secretless ID-login flow in `examples/fastify-web-server/README.md`.
- Verified through HTTP integration tests (`src/auth.spec.ts`, `src/app.spec.ts`) and a spawned `node dist/main.js` CLI smoke test: equal ID-login names resolving to one user without secrets, Google and Discord OAuth entry redirects and mocked callbacks, protected route guards, session attribution, logout, session non-persistence across restarts, config reload, newest-first unpaginated thread listing, creation-ordered comments, immutability, uncached reads, and append-only JSONL storage.
- `pnpm build`, `pnpm exec tsc --build`, `pnpm lint`, and `pnpm test` passed across all 5 workspace projects (14/14 tests in `examples/fastify-web-server`).
- Reconciled s0003 (no change needed), s0016, s0017 (no change needed), s0020, and s0021.
