## Project

`pnpm build`, `pnpm lint`, `pnpm test` should be preferred over `npx *`.

## Tracking Mistakes

- Whenever the user has pointed out a mistake you committed, append an entry to `worklog/note/n0001-mistakes.md`. Tool use mistakes are exceptions.

## Naming Convention

- Variables: `snake_case`
- Functions, callable variables: `camelCase`
- Classes, types, schema variables: `PascalCase`

## TypeScript Rules

- Prefer `null` over `undefined` for representing nullish values.
  - Prefer `== null` over `=== undefined`.