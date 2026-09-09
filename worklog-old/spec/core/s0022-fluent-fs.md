+++
id = "s0022"
title = "Fluent File System"
tags = ["util", "fs", "data"]
paths = ["packages/stelaro/src/fs/**"]
+++

## Related Specs

- s0021: Data Access (consumer — `DataAccess.read` delegates to fluent-fs)

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `json` and `toml` with a schema argument infer the return type from the schema.

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

### Path wrapper

- `fluentPath(base)` resolves the base to an absolute path and returns a `FluentPath`.
- `path` exposes the resolved absolute path as a string.
- `join(...segments)` appends path segments and returns a new `FluentPath`. The result is absolute. No traversal restriction — `..` may resolve above the original path.
- `confine(...segments)` appends path segments and returns a new `FluentPath`. Its `path` is **guaranteed** to be the base path (the original path) or a descendant of it, for *every* input — adversarial input included. `.` and `..` are resolved; `..` is capped at the base and can never escape above it (surplus `..` past the base is a no-op). Both `/` and `\` are treated as separators, so traversal cannot be smuggled through the non-native separator. Absolute segments — including a `drive:\` root — reset to the base, not to the filesystem root or another drive. Every other segment resolves to a name under the base. This containment is guaranteed as resolved by the `node:fs` backend (see Dangers).
- `read()` returns a `FileReader` targeting the current path.
- `write()` returns a `FileWriter` targeting the current path.

### File reading

- `text()` reads the file as a UTF-8 string.
- `buffer()` reads the file as a `Buffer`.
- `json()` reads the file as UTF-8 and parses it as JSON.
- `toml()` reads the file as UTF-8 and parses it as TOML.
- When a schema is provided, the parsed result is validated through the schema's `assert` method. The return type is inferred from `schema.infer`.
- When no schema is provided, `json()` returns `unknown` and `toml()` returns `unknown`.
- All read methods throw when the file does not exist, unless `optional()` has been called.

### Optional reads

- `optional()` returns an `OptionalFileReader` that returns `null` instead of throwing when the target file does not exist.
- Errors other than file-not-found (permission errors, parse errors, schema validation errors) still throw.

### File writing

- `text(content)` writes a UTF-8 string to the file.
- `buffer(data)` writes a `Buffer` to the file.
- `json(value)` serializes the value as JSON and writes it as UTF-8.
- `toml(value)` serializes the value as TOML and writes it as UTF-8.
- All write methods create parent directories if they do not exist.
- All write methods overwrite the file if it already exists.

## Constraints

- Path operations are pure — no I/O until a terminal read or write method is called.
- `FluentPath` is immutable — `join` returns a new instance.
- All paths exposed by `FluentPath` are absolute.
- `confine` is a containment boundary: for any `segments`, `confine(...segments).path` is the base path or a descendant of it, including under adversarial input. `join`, by contrast, intentionally permits escape above the base.
- The fluent-fs module must not depend on component, application, or configuration modules.

## Anticipated Changes

- Separate fluent-fs into its own package outside of stelaro.
- Abstract the I/O backend to decouple from `node:fs`, enabling alternative implementations (in-memory, fetch-based).
- Directory operations (list, create, remove, etc.) may be added.
- File/directory watching may be added.
- Locale-aware path resolution may be added.

## Dangers

- Growing the I/O surface without clear boundaries would turn this into a full fs abstraction library. Each addition should justify itself against bare `node:fs`.
- Coupling to `node:fs` internals would make the eventual backend abstraction harder.
- Silently swallowing non-ENOENT errors in optional mode would hide real failures.
- `confine`'s containment is guaranteed for the `node:fs` consumption model: libuv resolves `.`/`..` itself and hands the OS a namespaced path, so the only effective traversal token is `..` (which `confine` removes) — on Windows, trailing dots/spaces are not canonicalized into `..` and reserved device names do not redirect. A future non-`node:fs` backend (see Anticipated Changes) applying raw OS path canonicalization could reinterpret an otherwise-inert returned component (e.g. a Windows trailing dot/space collapsing into `..`); `confine` robustness must be revisited when the I/O backend is abstracted.
