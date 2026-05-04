+++
id = "t0008"
title = "Implement validated configuration"
status = "active"
tags = ["config", "application", "component", "context"]
modifies = ["s0001", "s0002", "s0003", "s0004", "s0008"]
+++

## Scope

- Declare config schemas on application and component definitions using Arktype.
- Load and validate TOML config files during application start.
- Expose validated config through `context.config` for components and `app.config` for application.
- Implement config reload with `onConfigReload` hooks.
- Update affected specs with approved behavior, leaving `UNIMPLEMENTED` markers where related behavior remains out of scope.

## Out of Scope

- Secrets management beyond typed configuration boundaries.
- Remote configuration providers.
- Gateway-specific configuration formats.
- Config file watching (automatic reload).

## Implementation Plan

### 1. Config loader module — `src/config/loader.ts`

Internal module that reads, parses, and validates TOML config files in one step. Isolates file IO and validation from the rest of core.

- `loadTomlConfig(path: string, schema: ConfigSchema): Promise<unknown>` — reads a file with `fs.readFile`, parses with `smol-toml`, validates the parsed object against the schema via `schema.assert()`. Returns the validated result. Throws `ConfigFileError` if the file doesn't exist or is unparseable. Throws `ConfigValidationError` if the parsed object fails schema validation.
- Config loading happens during `app.start()`, which is already async. No sync IO needed.

### 2. Config schema interface — `src/config/types.ts`

Reuses the existing `ComponentCallSchema` interface pattern (has `assert()`). A config schema is any Arktype schema that can validate a parsed TOML object.

- `ConfigSchema` — alias or extension of `ComponentCallSchema`. Same `inferIn`, `infer`, `assert()` contract.

### 3. Schema declaration on definitions

**Component:** Add optional `config` field to `Component` type:

```
defineComponent({
  calls: MyCalls,
  uses: [],
  config: type({ port: "number", host: "string" }),
  handlers: { ... },
})
```

Type signature: `config?: ConfigSchema`. When present, `TConfig` generic propagates through to `ComponentContext`.

**Application:** Add optional `config` field to `ApplicationDefinition`:

```
defineApplication({
  components: [...],
  config: type({ env: "'dev' | 'staging' | 'prod'" }),
})
```

### 4. Error types — `src/config/error.ts`

- `ConfigFileError` — file missing or unparseable TOML. Properties: `file_path`, `component_id?`.
- `ConfigValidationError` — schema validation failed. Properties: `component_id?`, `file_path`.

Both extend `PerantoError`.

### 5. Loading and validation in `app.start()`

Config loading happens at the beginning of `app.start()`, before component `start` hooks run:

1. Determine config directory: `args.config_dir ?? resolve("config")`.
2. If application definition has a `config` schema:
   - Call `loadTomlConfig("{config_dir}/application.toml", schema)`.
   - Store validated result as application config.
3. For each component with a `config` schema:
   - Call `loadTomlConfig("{config_dir}/{component_id}.toml", schema)`.
   - Populate the component's config slot with validated result.
4. Components/applications without config schemas: skip, no file required.
5. Any failure (missing file, parse error, validation error) causes `start()` to throw — application transitions to `failed`.
6. Component `start` hooks run after all config is loaded and validated, so `context.config` is available in `start` hooks.

`createApplication` remains synchronous and side-effect-free. It registers config schemas and sets up empty config slots, but performs no IO.

### 6. Context exposure — `context.config`

Extend `ComponentContext` with an optional `config` field, same conditional pattern as `state`:

```
type ComponentContext<TUses, TState, TConfig> =
  [TConfig] extends [undefined]
    ? BaseComponentContext<TUses>  // no config
    : BaseComponentContext<TUses> & { readonly config: TConfig }
```

Components declaring a config schema receive `context.config` typed from their schema's `infer` type. Components without config schemas do not receive `config` in context.

Config is provided through a getter backed by a mutable slot — same reference for all handler invocations, swappable during reload.

### 7. Application runtime exposure — `app.config`

Add `config` to the `Application` return type. Typed from the application definition's config schema. Getter-backed for reload.

Applications without a config schema: `app.config` is not present (same conditional pattern).

### 8. Config reload

#### `app.reloadConfig()` — full reload

- Re-reads all TOML files from the config directory.
- Validates all against declared schemas.
- If any validation fails: reject entire reload, old config persists, throw `ConfigValidationError`.
- On success: swap all config slots (application + all components).
- Call `onConfigReload(context)` on each component declaring the hook, in topological order.
- Call application `onConfigReload` hook after all component hooks.
- If any hook throws: application transitions to `failed`.
- Only valid in `active` state; throws `LifecycleStateError` otherwise.
- Returns `void`.

#### `app.reloadComponentConfig(component_id)` — single component reload

- Re-reads the single component's TOML file from the config directory.
- Validates against the component's declared config schema.
- If validation fails: old config persists, throw `ConfigValidationError`.
- On success: swap that component's config slot only.
- Call that component's `onConfigReload` hook if declared.
- If the hook throws: application transitions to `failed`.
- Only valid in `active` state; throws `LifecycleStateError` otherwise.
- Returns `void`.
- The `component_id` parameter is typed as a union of registered component IDs (`TComponents[number]["calls"]["id"]`), not bare `string`. Prevents typos and unregistered IDs at compile time.
- Calling with a component ID that has no config schema throws `ConfigValidationError` at runtime.

### 9. `onConfigReload` hook on definitions

**Component:** Optional `onConfigReload` field on component definition. Same context as handlers.

**Application:** Optional `onConfigReload` field on `ApplicationDefinition`.

### 10. Tests — `src/config/loader.spec.ts`, integration in `application.spec.ts`

Config loader unit tests:
- Parses valid TOML and returns validated object.
- Throws `ConfigFileError` on missing file.
- Throws `ConfigFileError` on invalid TOML.
- Throws `ConfigValidationError` when parsed TOML fails schema validation.

Integration tests (application.spec.ts):
- Component with config schema receives validated `context.config` after start.
- Component without config schema does not receive `context.config`.
- Application with config schema exposes `app.config` after start.
- `context.config` is available in component `start` hooks.
- Missing config file for a component with schema causes `start()` to throw.
- Invalid config causes `start()` to throw.
- `start()` transitions to `failed` on config error.
- `reloadConfig` swaps config values.
- `reloadConfig` rejects on validation failure, preserves old config.
- `onConfigReload` hooks called in topological order.
- `reloadConfig` throws `LifecycleStateError` when not active.
- `reloadComponentConfig` reloads a single component's config.
- `reloadComponentConfig` does not affect other components' config.
- `reloadComponentConfig` calls only the target component's `onConfigReload` hook.
- `reloadComponentConfig` rejects on validation failure, preserves old config.
- `reloadComponentConfig` throws `LifecycleStateError` when not active.
- `reloadComponentConfig` throws on component ID with no config schema.

### 11. Exports

- `src/config/index.ts` — re-export `ConfigSchema` type, error classes.
- `src/index.ts` — re-export from `./config/index.ts`.

### 12. Spec updates post-implementation

- s0008: remove `UNIMPLEMENTED` markers for implemented behavior.
- s0002: update `ApplicationDefinition` and `Application` types.
- s0003: update `Component` type with `config` field.
- s0004: update context with `config` exposure.
- s0001: remove UNIMPLEMENTED from "application coordinates configuration."

## Sequence

1. Error types (step 4).
2. Config loader unit + tests (steps 1, 10 loader part).
3. Config schema type (step 2).
4. Schema declaration on component/application definitions (step 3).
5. Loading and validation in `app.start()` (step 5).
6. Context exposure + `app.config` (steps 6, 7).
7. Integration tests for loading/context (step 10 integration part).
8. Reload implementation (step 8).
9. `onConfigReload` hooks (step 9).
10. Reload tests (step 10 reload part).
11. Exports (step 11).
12. Spec updates (step 12).

## Design Notes

- `createApplication` remains synchronous and side-effect-free — it registers schemas and sets up empty config slots but performs no IO.
- Config loading happens in `app.start()` before component `start` hooks, using async `fs.readFile`. This keeps IO in the already-async lifecycle path.
- Config slots are getter-backed mutable references — consistent snapshot per synchronous frame, swappable during reload.
- The `config` generic adds a third type parameter to `ComponentContext`. Existing components with `TConfig = undefined` are unaffected — backward compatible.
- The `--config-dir` CLI argument (from t0017/s0009) feeds directly into the config directory resolution.
