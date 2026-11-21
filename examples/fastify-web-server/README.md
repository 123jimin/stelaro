# Fastify Web Server Example

This example implements a bulletin board system (BBS) using public APIs from `@jiminp/stelaro`, `@jiminp/stelaro-fastify`, and `@jiminp/stelaro-pino`.

## What it demonstrates

- **Typed domain components (`users`, `threads`, `comments`)** with component-scoped append-only JSONL storage under `{data_dir}/{component_id}/*.jsonl` and uncached per-request reads.
- **Component-owned route groups** co-located with `threads`, `comments`, and `auth`, mounted on a thin Fastify gateway (`web`).
- **External authentication and session middleware**: `@fastify/cookie`, `@fastify/formbody`, `@fastify/session` (in-memory store with an ephemeral per-process secret), and `@fastify/passport` (Google and Discord strategies configured with mock credentials) live outside the gateway definition.
- **Validated gateway configuration (`config/web.toml`)** and unified Pino logging via `definePinoLogger` / `childPinoLogger("web")`.

## Running the server

From the repository root, build the workspace and start the example:

```bash
pnpm build
pnpm --filter stelaro-example-fastify-web-server start
```

Or run the built entry point directly with Stelaro CLI options (`--base-dir`, `--config-dir`, `--data-dir`, `--secrets-dir`, `--env`):

```bash
node examples/fastify-web-server/dist/main.js --data-dir /tmp/stelaro-bbs-data
```

With the default `config/web.toml`, the server listens at `http://127.0.0.1:3000`.

## Routes

- `GET /`: newest-first, unpaginated list of all threads.
- `GET /threads/:thread_id`: thread details and creation-ordered comments.
- `GET /threads/new`: authenticated form to create a thread.
- `POST /threads`: create an immutable thread as the session user.
- `POST /threads/:thread_id/comments`: create an immutable comment as the session user.
- `GET /login`: authentication methods (Google mock OAuth, Discord mock OAuth, and secretless ID login).
- `GET /login/google` and `GET /login/google/callback`: Google OAuth entry and callback (mock credentials).
- `GET /login/discord` and `GET /login/discord/callback`: Discord OAuth entry and callback (mock credentials).
- `POST /login/id`: establish a passwordless name-based session (equal names resolve to the same user).
- `POST /logout`: end the current session.

## Secretless ID-login smoke flow

```bash
# 1. Log in with a name (no password or secret) and save the session cookie.
curl -i -c cookies.txt -X POST -d "name=alice" http://127.0.0.1:3000/login/id

# 2. Create a thread as the authenticated session user.
curl -i -b cookies.txt -X POST -d "title=Hello&body=First+post" http://127.0.0.1:3000/threads

# 3. View all threads (newest-first, unpaginated).
curl -s http://127.0.0.1:3000/

# 4. Log out and end the in-memory session.
curl -i -b cookies.txt -c cookies.txt -X POST http://127.0.0.1:3000/logout
```

## Notes

- Sessions are stored strictly in memory and do not survive server restarts.
- Google and Discord OAuth use mock client credentials and are wired for local demonstration and mock testing without live OAuth secrets.
- Threads and comments are immutable (append-only) and thread listing is never paginated.
