+++
id = "s0010"
title = "Fluent Filesystem"
tags = ["util", "fs", "data"]
paths = ["packages/stelaro/src/fs/**"]
+++

# Fluent Filesystem

## Types

Types are shown at their widest for readability.
Schema overloads SHOULD infer their return type from `schema.infer`.

```typescript
type Schema = {
    readonly infer: unknown;
    assert(input: unknown): this["infer"];
};

type ReadOptions = {
    readonly optional?: boolean;
};

type FluentPath = {
    readonly path: string;
    join(...segments: string[]): FluentPath;
    confine(...segments: string[]): FluentPath;
    read(options: ReadOptions & {readonly optional: true}): OptionalFileReader;
    read(options?: ReadOptions): FileReader;
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

class NotRegularFileError extends StelaroError {
    readonly file_path: string;
}

function createFluentPath(base: string): FluentPath;
```

## Paths

- `createFluentPath(base)` resolves an absolute, immutable `FluentPath`.
- Path operations perform no I/O.
- `read` and `write` create terminal operations.
- `join` returns an absolute path and permits traversal above the base.
- `confine` guarantees that every result, including adversarial input, is the original base or its descendant under `node:fs` path interpretation.
  - Resolve `.` and `..`. Surplus `..` stops at the base.
  - Treat both `/` and `\` as separators.
  - Reset to the base for absolute and drive-rooted segments.
  - Resolve other segments as names below the base.
- Every exposed `FluentPath.path` SHOULD be absolute, and every path operation SHOULD return a new object.

## Reads and writes

- Readers support UTF-8 text, `Buffer`, JSON, and TOML. JSON and TOML schema overloads validate with `assert`.
  - Reads without a schema return `unknown` for JSON and TOML.
- Reads accept only regular files.
  - A symlink counts as the file it points to.
  - A directory, FIFO, device, or other non-regular file throws `NotRegularFileError`, even in optional mode.
  - The check and read use the same open handle.
  - Opening never waits on a FIFO.
- Reads throw on missing files unless optional mode is selected with `optional()` or `read({optional: true})`.
  - Optional reads return `null` only when nothing can exist at the path (`ENOENT`, `ENOTDIR`, or `ENAMETOOLONG`).
  - Permission, parsing, and validation errors propagate.
- Writers support UTF-8 text, `Buffer`, JSON, and TOML.
  - They create parent directories and overwrite existing files.

## Constraints

- Use `confine` for adversarial path containment.
- The module MUST NOT depend on component, application, or configuration modules.

## Dangers

- The containment guarantee relies on `node:fs` and libuv path interpretation and does not resolve symlinks.
  - A different backend may reinterpret otherwise inert names.
  - Re-evaluate confinement before abstracting the backend.

## Anticipated changes

- The module may become a separate package with pluggable I/O backends.
- Directory operations, watching, and locale-aware paths may be added.
