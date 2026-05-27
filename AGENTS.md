## Project

`pnpm build`, `pnpm lint`, `pnpm test` are preferred over ones using `npx`.

## Naming Convention

- Variables: `snake_case`
- Functions, callable variables: `camelCase`
- Classes, types, schema variables: `PascalCase`

## TypeScript Rules

- Prefer `null` over `undefined` for representing nullish values.
  - Prefer `== null` over `=== undefined`.