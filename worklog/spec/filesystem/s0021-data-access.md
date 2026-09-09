+++
id = "s0021"
title = "Data Access"
tags = ["application", "component", "context", "data"]
paths = ["packages/stelaro/src/data/**"]
+++

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

- Data access SHOULD delegate all I/O to s0022 and SHOULD NOT depend on component
  configuration, secrets, or other declarations.
- Data-access subpaths SHOULD use s0022's `confine` guarantee and inherit its
  backend and realpath limitations.

## Anticipated Changes

- Locale-aware data resolution may be added.

## Dangers

- Resolution does not create directories.
- Any change to s0022's containment guarantee requires review of this spec.
