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
- `context.data.resolve(subpath)` confines the subpath within `context.data.dir`.
- `context.data.read(subpath)` returns a `FileReader` (s0022) targeting the resolved path.
- `context.data.write(subpath)` returns a `FileWriter` (s0022) targeting the resolved path.
- Data access does not require a declaration on the component (unlike config or secrets).

### Application-Level

- The application exposes `app.data: DataAccess`.
- `app.data.dir` resolves to `{base_dir}/data`.
- `app.data.resolve(subpath)` confines the subpath within `app.data.dir`.
- `app.data.read(subpath)` and `app.data.write(subpath)` behave identically to the component-level equivalents.

### Path Resolution

- `dir` is an absolute path.
- `resolve` confines the subpath within the data directory (s0022 `confine`): `..` cannot escape the data directory, and absolute segments reset to it.
- Neither `dir` nor `resolve` check whether the path exists on disk.

## Constraints

- Data access delegates all I/O to the fluent-fs util (s0022) — it does not implement I/O directly.
- Data access must not depend on component declarations (config schema, secrets schema, etc.).
- Data-access subpaths are confined to the data directory (via s0022 `confine`): `..` cannot traverse above it and absolute segments reset to it. This containment is guaranteed under the `node:fs` backend (see Dangers). Containment is not realpath-based, so symlink/junction escape is out of scope (hard/soft links assumed absent).

## Anticipated Changes

- Locale-aware resolution (e.g., `data/{locale}/`) may be added later.

## Dangers

- Implicit directory creation would surprise callers who only intended to resolve a path.
- Data-access containment inherits s0022 `confine`'s scope: it holds for the `node:fs` consumption model (libuv resolves `.`/`..` and hands the OS a namespaced path, so the only effective traversal token is `..`). If s0022's I/O backend is abstracted away from `node:fs` (an anticipated change there) and applies raw OS path canonicalization, a returned subpath component could be reinterpreted (e.g. a Windows trailing dot/space collapsing into `..`); data-access containment must be revisited alongside `confine` then.
