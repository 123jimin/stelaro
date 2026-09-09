+++
id = "s0022"
title = "Fluent File System"
tags = ["util", "fs", "data"]
paths = ["packages/stelaro/src/fs/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0022.

## Types

Types are shown at their widest readable form. Schema overloads MUST infer
their return type from `schema.infer`.

```typescript
type Schema = {
    readonly infer: unknown;
    assert(input: unknown): this["infer"];
};

type FluentPath = {
    readonly path: string;
    join(...segments: string[]): FluentPath;
    confine(...segments: string[]): FluentPath;
    read(): FileReader;
    write(): FileWriter;
};

type FileReader = {
    optional(): OptionalFileReader;
    text(): Promise<string>;
    buffer(): Promise<Buffer>;
    json(): Promise<unknown>;
    json(schema: Schema): Promise<unknown>;
    toml(): Promise<unknown>;
    toml(schema: Schema): Promise<unknown>;
};

type OptionalFileReader = {
    text(): Promise<string | null>;
    buffer(): Promise<Buffer | null>;
    json(): Promise<unknown>;
    json(schema: Schema): Promise<unknown>;
    toml(): Promise<unknown>;
    toml(schema: Schema): Promise<unknown>;
};

type FileWriter = {
    text(content: string): Promise<void>;
    buffer(data: Buffer): Promise<void>;
    json(value: unknown): Promise<void>;
    toml(value: unknown): Promise<void>;
};

function fluentPath(base: string): FluentPath;
```

## Behavior

- `fluentPath(base)` resolves an absolute, immutable `FluentPath`. Path
  operations perform no I/O; `read` and `write` create terminal operations.
- `join` returns an absolute path and intentionally permits traversal above the
  base.
- `confine` guarantees that every result, including adversarial input, is the
  original base or its descendant under `node:fs` resolution:
  - `.` and `..` are resolved; surplus `..` stops at the base.
  - Both `/` and `\` are separators.
  - Absolute and drive-rooted segments reset to the base.
  - Other segments resolve as names below the base.
- Readers support UTF-8 text, `Buffer`, JSON, and TOML. JSON/TOML schema
  overloads validate with `assert`; unschematized reads return `unknown`.
- Reads throw on missing files unless `optional()` is selected. Optional reads
  return `null` only for file-not-found and propagate permission, parsing, and
  validation errors.
- Writers support UTF-8 text, `Buffer`, JSON, and TOML; they create parent
  directories and overwrite existing files.

## Constraints

- Every exposed `FluentPath.path` MUST be absolute and every path operation
  MUST return a new object.
- `confine` is an adversarial containment boundary; `join` is not.
- The module MUST NOT depend on component, application, or configuration
  modules.

## Anticipated Changes

- The module may become a separate package with pluggable I/O backends.
  Directory operations, watching, and locale-aware paths may be added.

## Dangers

- The containment guarantee assumes `node:fs`/libuv path interpretation and is
  not realpath-based. A future backend may reinterpret otherwise inert names;
  confinement MUST be re-evaluated when abstracting the backend.
