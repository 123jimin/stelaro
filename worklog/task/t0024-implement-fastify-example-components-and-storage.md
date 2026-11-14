+++
id = "t0024"
title = "Implement Fastify example components and storage"
status = "pending"
tags = ["examples", "component", "data"]
modifies = ["s0003", "s0020", "s0021"]
blocked_by = []
+++

# Implement Fastify example components and storage (NEEDS APPROVAL)

Create `examples/fastify-web-server` and implement the users, threads, and comments domain and storage described by s0021 through public Stelaro APIs.
The routes, authentication, and runnable server are completed by t0025; this intermediate work must not be presented as a runnable server under s0020.
The UNIMPLEMENTED stock-market example in s0022 is outside this task.

## Completion criteria

- Include the example in the workspace and applicable TypeScript, build, lint, and test configuration.
  Follow s0003 for dependencies and s0020 for example content.
- Implement typed calls for resolving provider identities and creating users on first sight, creating/listing/getting threads, and creating/listing comments by thread.
- Store the exact fields specified in s0021 in `users/users.jsonl`, `threads/threads.jsonl`, and `comments/comments.jsonl` under component-scoped data directories from s0011.
  Verify uncached per-request reads and append-only writes.
- Verify immutable threads and comments, newest-first unpaginated thread listing, creation-ordered comments, and persistence across application restarts.
- Keep domain components independent of raw gateway runtime objects and leave component-owned route groups to t0025.
- Pass `pnpm build`, `pnpm lint`, and `pnpm test` with focused checks of domain behavior and persisted records.
