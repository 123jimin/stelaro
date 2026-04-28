# @jiminp/peranto

Opinionated Component System

## Finishing the Setup

1. Review `package.json` and `LICENSE` to ensure correctness.
2. Install dependencies with `pnpm install`.
    - It is recommended to also run `pnpm up --latest` to update dependencies to their latest versions.
3. Remove this section.

## Development

This project uses [pnpm](https://pnpm.io/) for package management.

- `pnpm build` – compile TypeScript from `src/` into `dist/`.
  - `pnpm build:watch` – recompile on every file change.
- `pnpm test` – run unit tests from `src/**/*.spec.ts`.
  - Don't forget to run `pnpm build` before running tests!
- `pnpm lint` – run ESLint on the source code.
- `pnpm clean` – remove the `dist/` directory.

## License

[MIT](./LICENSE)
