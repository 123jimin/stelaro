+++
id = "t0025"
title = "Implement Fastify example routes and authentication"
status = "pending"
tags = ["examples", "gateway", "fastify", "config", "logging"]
modifies = ["s0003", "s0016", "s0017", "s0020", "s0021"]
blocked_by = ["t0020", "t0024"]
+++

# Implement Fastify example routes and authentication (NEEDS APPROVAL)

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
