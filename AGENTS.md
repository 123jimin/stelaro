# AGENTS.md for stelaro

- `pnpm build`, `pnpm lint`, `pnpm test` should be preferred over `npx *`.
- Comments should be concise and human-friendly.
- In prose, break lines at natural boundaries (sentences, clauses), not at a fixed column width.
- Adhere to naming convention:
  - `snake_case` for variables and object fields (but see below)
  - `PascalCase` for types, classes, and interfaces; incl. (arktype) schemas
  - `camelCase` for functions; incl. callable variables and fields
- Import arktype's `type` unaliased: `import {type} from "arktype"`.
- Prefer `null` over `undefined` for representing nullish values.
  - Prefer `== null` over `=== undefined`.

## Tracking Mistakes

- Whenever the user has pointed out a mistake you committed, append an entry to `worklog/note/n0001-mistakes.md`. Tool use mistakes are exceptions.