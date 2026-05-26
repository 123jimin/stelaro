+++
id = "s0021"
title = "Data Access"
tags = ["application", "component", "context", "data"]
paths = ["packages/stelaro/src/data/**"]
+++

## Related Specs

- s0002: Application
- s0004: Context
- s0019: Base Directory (`{component_id}/data/`, `data/`)
- s0022: Fluent File System (provides `FileReader` and `FileWriter` via delegation)

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

### Overview

- Data access provides component-scoped and application-scoped path resolution for files under the base directory's `data/` subdirectories.
- Data access resolves paths and provides fluent file I/O through delegation to the fluent-fs util (s0022).

### Component-Level

- Every component context exposes `context.data: DataAccess`.
- `context.data.dir` resolves to `{base_dir}/{component_id}/data`.
- `context.data.resolve(subpath)` joins the subpath onto `context.data.dir`.
- `context.data.read(subpath)` returns a `FileReader` (s0022) targeting the resolved path.
- `context.data.write(subpath)` returns a `FileWriter` (s0022) targeting the resolved path.
- Data access does not require a declaration on the component (unlike config or secrets).

### Application-Level

- The application exposes `app.data: DataAccess`.
- `app.data.dir` resolves to `{base_dir}/data`.
- `app.data.resolve(subpath)` joins the subpath onto `app.data.dir`.
- `app.data.read(subpath)` and `app.data.write(subpath)` behave identically to the component-level equivalents.

### Path Resolution

- `dir` is an absolute path.
- `resolve` uses `path.join` to combine the data directory with the subpath.
- Neither `dir` nor `resolve` check whether the path exists on disk.

## Constraints

- Data access delegates all I/O to the fluent-fs util (s0022) — it does not implement I/O directly.
- Data access must not depend on component declarations (config schema, secrets schema, etc.).
- Data paths are rooted within the base directory; the data access API does not enforce containment (path traversal prevention is not a goal at this layer).

## Anticipated Changes

- Locale-aware resolution (e.g., `data/{locale}/`) may be added later.

## Dangers

- Implicit directory creation would surprise callers who only intended to resolve a path.
