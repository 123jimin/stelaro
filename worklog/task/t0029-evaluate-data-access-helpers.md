+++
id = "t0029"
title = "Evaluate read/write helpers for DataAccess"
status = "pending"
tags = ["data", "fs", "investigation"]
modifies = ["s0021", "s0022"]
blocked_by = []
+++

## Objective

Determine whether `DataAccess` should grow read and write helper methods, or whether callers should use `node:fs` directly against the paths `DataAccess` already provides.

## Candidates

### Architecture: fluent fs util + DataAccess delegation

A standalone fluent fs utility provides the I/O + parsing surface for any absolute path. DataAccess delegates to it, staying a path resolver.

```
fluent-fs util:  read(absolutePath).json() / .text() / .toml() / .buffer()
DataAccess:      data.read(subpath)  →  fluentRead(data.resolve(subpath))
```

### Fluent read API (util layer)

`read(path)` returns an intermediate object with parsing methods:

- `.text()` — read as UTF-8 string
- `.buffer()` — read as Buffer
- `.json()` — read + `JSON.parse`
- `.toml()` — read + TOML parse

### Fluent write API (util layer)

`write(path)` returns an intermediate object with serialization methods, symmetric to the read API:

- `.text(content)` — write a UTF-8 string
- `.buffer(data)` — write a Buffer
- `.json(value)` — serialize via `JSON.stringify` + write
- `.toml(value)` — serialize to TOML + write

```ts
await data.write("output.json").json(items);
await data.write("report.txt").text(report);
```

Parent directory creation: evaluate whether write should auto-create parent directories (`{ recursive: true }`) or require them to exist.

### DataAccess integration

`data.read(subpath)` delegates to the fluent util with the resolved absolute path. DataAccess itself does not perform I/O — the util does.

### Schema validation

`.json()` and `.toml()` accept an optional schema (ArkType-compatible). When provided, the parsed result is validated and the return type is inferred.

```ts
await data.read("items.json").json()               // Promise<unknown>
await data.read("items.json").json(ItemsSchema)     // Promise<ItemsSchema["infer"]>
await data.read("config.toml").toml(ConfigSchema)   // Promise<ConfigSchema["infer"]>
```

### Default values on missing file

Decision: **option C — `.optional()` modifier**. Returns `T | null` on missing file; callers use `?? fallback` for defaults.

```ts
await data.read("items.json").optional().json(ItemsSchema)   // Promise<Schema["infer"] | null>
await data.read("items.json").json(ItemsSchema)               // Promise<Schema["infer"]> (throws on missing)
```

Specified in s0022.

### Baseline: bare `node:fs`

Callers already have `data.resolve(subpath)` and can call `fs.readFile` / `fs.writeFile` themselves. The question is whether the fluent chain eliminates enough boilerplate + parsing ceremony to justify the util.

Compare:
```ts
// fluent via DataAccess
const items = await data.read("items.json").json();

// fluent via util directly
const items = await read(absolutePath).json();

// bare node:fs
const items = JSON.parse(await readFile(data.resolve("items.json"), "utf-8"));
```

## Evaluation Criteria

- **Ergonomic gain** — how much boilerplate do helpers actually eliminate vs. `fs.readFile(data.resolve(subpath), "utf-8")`?
- **Abstraction cost** — does wrapping `node:fs` add a layer that callers will eventually need to bypass (encoding options, flags, streams)?
- **Testability** — does indirection through helpers make it easier or harder to test component code?
- **Scope creep** — does the util attract unbounded I/O surface (mkdir, exists, glob, watch)?
- **Separation of concerns** — the util owns I/O; DataAccess stays a path resolver that delegates. Does this layering hold cleanly?
- **Independent utility** — is the fluent fs util useful outside DataAccess (e.g., config loader, CLI tooling)?

## Output

A decision on whether to proceed, with rationale. If yes, a spec update to s0021 and a follow-up implementation task. If no, update s0021 anticipated changes to reflect the decision.
