+++
id = "s0021"
title = "Data Access"
tags = ["application", "component", "context", "data"]
paths = ["packages/stelaro/src/data/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0021. Confinement semantics
and limits are owned by s0022.

## Types

```typescript
type DataAccess = {
    readonly dir: string;
    resolve(subpath: string): string;
    read(subpath: string): FileReader;
    write(subpath: string): FileWriter;
};
```

## Behavior

- Every component receives `context.data` without declaring it. Its absolute
  `dir` is `{base_dir}/{component_id}/data`.
- The application receives `app.data`, whose absolute `dir` is
  `{base_dir}/data`.
- `resolve(subpath)` confines the result to `dir` using s0022 `confine`.
  Neither `dir` nor `resolve` checks filesystem existence.
- `read` and `write` target the confined path and delegate to s0022
  `FileReader` and `FileWriter`.

## Constraints

- Data access MUST delegate all I/O to s0022 and MUST NOT depend on component
  configuration, secrets, or other declarations.
- Under the `node:fs` backend, `..` cannot escape `dir`, either slash is a
  separator, and absolute segments reset to `dir`.
- Containment is lexical rather than realpath-based; symlink and junction
  escapes are out of scope and links are assumed absent.

## Anticipated Changes

- Locale-aware data resolution may be added.

## Dangers

- Resolution does not create directories.
- If s0022 adopts a backend that applies different path canonicalization, its
  adversarial containment guarantee and this spec MUST be reviewed together.
