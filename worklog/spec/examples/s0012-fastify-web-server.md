+++
id = "s0012"
title = "Fastify Web Server Example"
tags = ["examples"]
paths = ["examples/fastify-web-server/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0012.

## Behavior

### Domain and API

- The example is a BBS built only from public Stelaro APIs. Users create
  immutable threads and comments; the thread list is newest-first and
  unpaginated.
- Routes are:
  - `GET /`: list all threads.
  - `GET /threads/:thread_id`: return a thread and creation-ordered comments.
  - `GET /threads/new`: authenticated new-thread form.
  - `POST /threads`: authenticated thread creation by the session user.
  - `POST /threads/:thread_id/comments`: authenticated comment creation.
  - `GET /login`: list authentication methods.
  - `GET /login/google` and `/login/google/callback`: Google OAuth.
  - `GET /login/discord` and `/login/discord/callback`: Discord OAuth.
  - `POST /login/id`: establish a passwordless name-based session.
  - `POST /logout`: end the session.

### Authentication and components

- `@fastify/passport` provides Google and Discord strategies with mock
  credentials. ID login maps equal names to the same user without a secret.
  Sessions are in-memory and do not survive restart.
- `users` resolves provider identities and creates users on first sight;
  `threads` creates, lists, and gets threads; `comments` creates and lists
  comments by thread.
- Component modules own their route groups: index/thread routes are in
  `threads`, comment routes in `comments`, and authentication routes in `auth`.
  The gateway is a thin shell listing these mounts.
- Handlers receive raw Fastify request/reply objects with Stelaro helpers.
  Standard Fastify route options pass through unchanged. Authentication and
  session middleware are configured outside the gateway definition.

### Storage

- Components perform uncached, per-request reads and append-only JSONL writes
  under their s0021 component data directories.
- `users/users.jsonl` records `user_id`, `provider`, `provider_account_id`,
  `display_name`, and `created_at`; provider is `google`, `discord`, or `id`.
- `threads/threads.jsonl` records `thread_id`, `author_user_id`, `title`, `body`,
  and `created_at`.
- `comments/comments.jsonl` records `comment_id`, `thread_id`, `author_user_id`,
  `body`, and `created_at`.

## Constraints

- OAuth credentials MUST remain mock values; ID login MUST remain secretless.
- Authentication and sessions MUST remain outside the gateway definition.
- Sessions MUST NOT persist. Threads and comments MUST NOT be editable or
  deletable, and thread listing MUST NOT be paginated.
