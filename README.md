# @jiminp/peranto

**Peranto** is my own flexible component system for various applications:

- Web Server
- CLI Application
- Discord Bot

## Development

This project uses [pnpm](https://pnpm.io/) for package management.

- `pnpm build` – compile TypeScript packages from `src/` into `dist/`.
  - `pnpm build:watch` – recompile the core package on every file change.
- `pnpm test` – run package unit tests from `dist/**/*.spec.js`.
  - Don't forget to run `pnpm build` before running tests!
- `pnpm lint` – run ESLint on the source code.
- `pnpm clean` – remove the `dist/` directory.

## Packages

- `@jiminp/peranto` – core component system.
- `@jiminp/peranto-fastify` – Fastify gateway component.
- `@jiminp/peranto-discord` – Discord.js gateway component.
- `@jiminp/peranto-pino` – Pino logger adapter.

## License

[MIT](./LICENSE)
