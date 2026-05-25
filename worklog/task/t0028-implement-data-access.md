+++
id = "t0028"
title = "Implement data directory access"
status = "pending"
tags = ["application", "component", "context", "data"]
modifies = ["s0021", "s0004", "s0019"]
blocked_by = []
+++

## Scope

Add `DataAccess` type and wire it into component context and application.

### New file: `packages/stelaro/src/data/data.ts`

```ts
import {join} from "node:path";

type DataAccess = {
    readonly dir: string;
    resolve(subpath: string): string;
};

function createDataAccess(base_path: string): DataAccess {
    return {
        dir: base_path,
        resolve(subpath: string) { return join(base_path, subpath); },
    };
}
```

Export from `packages/stelaro/src/data/index.ts` and re-export from package root index.

### Context changes: `packages/stelaro/src/component/context.ts`

- Add `readonly data: DataAccess` to `BaseComponentContext` (always present, like `log` and `call`).
- Add `readonly data: DataAccess` to `AnyComponentContext`.

### Application changes: `packages/stelaro/src/application/application.ts`

- Add `readonly data: DataAccess` to the `Application` type.
- In `createApplication`, create `app.data` as `createDataAccess(join(base_dir, "data"))`.
- In `buildContext`, create `data` as `createDataAccess(join(base_dir, runtime.id, "data"))`. `buildContext` needs `base_dir` passed in (currently it only receives `runtime` and `dispatchCall`).

### Spec updates

- s0004: Add `readonly data: DataAccess` to the `ComponentContext` type listing. Remove "Resource and template access through context may be specified separately" from anticipated changes (it's now specified by s0021).
- s0019: Remove `UNIMPLEMENTED` markers from `data/` and `{component_id}/data/` entries.

## Out of Scope

- File reading methods (`read`, `readBuffer`).
- Locale-aware resolution.
- Directory creation or existence checks.
- Path traversal prevention.
