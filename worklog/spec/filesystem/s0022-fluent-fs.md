+++
id = "s0022"
title = "Fluent File System"
tags = ["util", "fs", "data"]
paths = ["packages/stelaro/src/fs/**"]
+++

## Types

Types are shown at their widest readable form. Schema overloads SHOULD infer
their return type from `schema.infer`.

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

function fluentPath(base: string): FluentPath;
```

## Behavior

- `fluentPath(base)` resolves an absolute, immutable `FluentPath`. Path
  operations perform no I/O; `read` and `write` create terminal operations.
- `join` returns an absolute path and intentionally permits traversal above the
  base.
- `confine` guarantees that every result, including adversarial input, is the
  original base or its descendant under Node's `node:fs` resolution:
  - On Windows, Node opens paths with the `\\?\` prefix, so reserved device
    names (`CON`, `NUL`, `COM1`), trailing dots and spaces, and `:` stream
    suffixes stay inside the base.
  - `.` and `..` are resolved; surplus `..` stops at the base.
  - Both `/` and `\` are separators.
  - Absolute and drive-rooted segments reset to the base.
  - Other segments resolve as names below the base.
- Readers support UTF-8 text, `Buffer`, JSON, and TOML. JSON/TOML schema
  overloads validate with `assert`; unschematized reads return `unknown`.
- Reads accept only regular files; a symlink counts as the file it points to.
  Anything else, such as a directory, a FIFO, or a device,
  throws `NotRegularFileError`, even in optional mode. The check and the read
  use the same open handle, and opening never waits on a FIFO.
- Reads throw on missing files unless optional mode is selected with `optional()` or `read({optional: true})`.
  Optional reads return `null` only when nothing can exist at the path (`ENOENT`, `ENOTDIR`, or `ENAMETOOLONG`).
  Permission, parsing, and validation errors are propagated.
- Writers support UTF-8 text, `Buffer`, JSON, and TOML; they create parent
  directories and overwrite existing files.

## Constraints

- Every exposed `FluentPath.path` SHOULD be absolute and every path operation
  SHOULD return a new object.
- `confine` is an adversarial containment boundary; `join` is not.
- The module MUST NOT depend on component, application, or configuration
  modules.

## Anticipated Changes

- The module may become a separate package with pluggable I/O backends.
  Directory operations, watching, and locale-aware paths may be added.

## Dangers

- The containment guarantee assumes Node's `node:fs` path interpretation and is
  not realpath-based. It rests on Node's `\\?\` prefixing on Windows, which Node
  does not document as a contract; other runtimes differ (under Bun, `NUL` is
  the null device). A future backend or runtime may reinterpret otherwise inert
  names; confinement MUST be re-evaluated when abstracting the backend or
  supporting another runtime.
