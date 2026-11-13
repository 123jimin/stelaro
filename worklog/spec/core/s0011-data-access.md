+++
id = "s0011"
title = "Data Access"
tags = ["application", "component", "context", "data"]
paths = ["packages/stelaro/src/data/**"]
+++

# Data Access

## Types

```typescript
type DataAccess = {
    readonly dir: string;
    resolve(subpath: string): string;
    read(subpath: string): FileReader;
    write(subpath: string): FileWriter;
};

function createDataAccess(dir: string): DataAccess;
```

## Behavior

- `createDataAccess(dir)` creates an accessor rooted at the supplied directory without accessing the filesystem.
  - A relative `dir` resolves against the working directory, and the accessor exposes the absolute path as `dir`.
- `resolve(subpath)` confines the result to `dir` using s0010 `confine`.
  - Accessing `dir` and calling `resolve` require no existence check or directory creation.
- `read` and `write` target the confined path and delegate to the s0010 `FileReader` and `FileWriter`.

## Application and component integration

- The application receives `app.data` with the absolute data directory (s0008).
- Every component receives `context.data` without a declaration.
  - Its absolute directory is `{data_dir}/{component_id}` (s0008).

## Constraints

- Data access SHOULD delegate all I/O to s0010 and SHOULD NOT depend on component configuration, secrets, or other declarations.
- Data-access subpaths SHOULD use the s0010 confinement guarantee and inherit its backend and realpath limitations.
  - Review this spec whenever that guarantee changes.

## Anticipated changes

- Locale-aware data resolution may be added.
