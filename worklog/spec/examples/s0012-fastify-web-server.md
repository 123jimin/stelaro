+++
id = "s0012"
title = "Fastify Web Server Example"
tags = ["examples"]
paths = ["examples/fastify-web-server/**"]
+++

## Related Specs

- s0010: Examples (Common)

## Behavior

### Domain

- A BBS (bulletin board system) server built from public Stelaro APIs.
- Users may create threads and leave comments. Threads and comments may not be edited or deleted.

### HTTP API

- `GET /` returns a list of all threads, newest first, without pagination.
- `GET /threads/:thread_id` returns the thread with its comments in creation order.
- `GET /threads/new` returns a form for creating a new thread. Requires an authenticated session.
- `POST /threads` creates a new thread authored by the session user. Requires an authenticated session.
- `POST /threads/:thread_id/comments` appends a comment to the thread, authored by the session user. Requires an authenticated session.
- `GET /login` returns a page listing the available authentication methods.
- `GET /login/google` initiates the Google OAuth flow.
- `GET /login/google/callback` completes the Google OAuth flow and establishes a session.
- `GET /login/discord` initiates the Discord OAuth flow.
- `GET /login/discord/callback` completes the Discord OAuth flow and establishes a session.
- `POST /login/id` accepts a name and establishes a session as that user, without password or other secret.
- `POST /logout` ends the current session.

### Authentication

- Authentication uses `@fastify/passport` with Google and Discord strategies.
- OAuth credentials for Google and Discord are mock values.
- An ID-based login accepts a name and establishes a session as the user identified by that name, with no password or secret. Two logins with the same name resolve to the same user.
- Sessions are kept in memory and do not persist across application restarts.

### Components

- `users` resolves an authenticated identity (provider plus provider-account-id) to a user record, creating a record on first sight.
- `threads` provides create, list, and get-by-id behavior for threads.
- `comments` provides create and list-by-thread behavior for comments.
- A Fastify HTTP gateway composes route group mounts from component files. The gateway file is a thin shell that lists mounts.
- Route groups are co-located with the component they primarily serve. Thread-related routes (including the index page) live in the threads module. Comment routes live in the comments module. Auth routes live in the auth module.
- Gateway route handlers receive the Fastify request and reply objects alongside Stelaro helpers. Gateway route definitions accept standard Fastify route options and forward them transparently.
- Authentication and session middleware are configured at the Fastify application level, outside the gateway definition. Route handlers access auth state through the Fastify request object.

### Persistent storage

- Components read and write JSONL files directly per request, without in-memory caching.
- Persistence uses append-only JSONL files under `data/`.
- `data/users.jsonl` stores one user record per line with fields `user_id`, `provider`, `provider_account_id`, `display_name`, `created_at`. `provider` is one of `google`, `discord`, or `id`.
- `data/threads.jsonl` stores one thread record per line with fields `thread_id`, `author_user_id`, `title`, `body`, `created_at`.
- `data/comments.jsonl` stores one comment record per line with fields `comment_id`, `thread_id`, `author_user_id`, `body`, `created_at`.

## Constraints

- The example must build only from public Stelaro APIs.
- The Fastify gateway definition must not include authentication or session concerns.
- OAuth credentials for Google and Discord must be mock values, never real secrets.
- The ID-based login must not require a password or any other secret.
- Sessions must not be persisted to disk.
- Threads and comments must not be editable or deletable by users.
- The thread list must not be paginated.

## Anticipated Changes

- None recorded.

## Dangers

- Replacing mock OAuth credentials with real ones would make the example unsafe to reuse.
- Presenting the ID-based login as a production-grade authentication method would mislead readers, since it intentionally has no password or secret.
- Adding behavior beyond the approved BBS scope (threads, comments, the three authentication methods) would make the example imply unsupported behavior.
