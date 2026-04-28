# Node.js TypeScript Template

A minimal starting point for building a Node.js library in TypeScript.

## Features

- Compile with [TypeScript](https://www.typescriptlang.org/).
- Lint with [ESLint](https://eslint.org/).
- Test with [Node.js Test Runner](https://nodejs.org/api/test.html).
- GitHub CI for continuous integration.
- Manage dependencies with [pnpm](https://pnpm.io/).

## Getting Started

### Using the Bootstrap Script

1. Run `node bootstrap.js`, and follow the prompts.
2. Check the generated `README.md` for further instructions.

### Manual Setup

1. Choose a license to use, and replace the `LICENSE` file and the `license` field in `package.json`.
2. Search for all placeholder values in `package.json` (via searching `placeholder`) and replace them.
3. Install dependencies with `pnpm install` and update them with `pnpm up --latest`.
    - [Install pnpm](https://pnpm.io/installation) if you haven't.
4. Replace the contents of this README with a description of your library.

## Development

After setting up, you can use the following commands:

- `pnpm build` – compile TypeScript from `src/` into `dist/`.
  - `pnpm build:watch` – recompile on every file change.
- `pnpm test` – run unit tests from `src/**/*.spec.ts`.
  - Don't forget to run `pnpm build` before running tests!
- `pnpm lint` – run ESLint on the source code.
- `pnpm clean` – remove the `dist/` directory.

## License

This template is [Unlicensed](./LICENSE).