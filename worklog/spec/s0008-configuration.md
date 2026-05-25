+++
id = "s0008"
title = "Configuration"
tags = ["config", "application", "component", "context"]
paths = ["packages/stelaro/src/config/**"]
+++

## Related Specs

- s0002: Application
- s0003: Component
- s0004: Context
- s0019: Base Directory

## Behavior

### Sources

- Configuration file paths within the base directory are defined by s0019.

### Schema Declaration

- Applications may declare a config schema for application-level configuration.
- Components may declare a config schema for component-level configuration.
- Config schemas use Arktype.
- Default values for missing config fields are determined by the Arktype schema.

### Loading and Validation

- Configuration is loaded and validated during application start, before component start hooks run.
- Config files are parsed as TOML and validated against declared schemas.
- If any config validation fails, application start fails and the application transitions to `failed`.
- Components without config schemas do not require a config file and are skipped during config loading.
- Applications without a config schema do not require an application config file.

### Environment Overlays

- When an environment is set (via `--env` CLI argument or `ApplicationOptions.env`), environment overlay files are loaded after base files.
- Overlay values are deep-merged onto the base file using `recursiveMerge`. Overlay fields take precedence.
- Missing overlay files are silently skipped — the base file stands alone.
- Schema validation runs against the merged result, not the individual files.
- Environment overlays apply to both config and secrets, at both application and component levels.

### Secrets

- Applications may declare a secrets schema for application-level secrets.
- Components may declare a secrets schema for component-level secrets.
- Secrets schemas use Arktype (same interface as config schemas).
- Secrets are loaded and validated during application start, before component start hooks run.
- Secrets files (`secrets.toml`) are parsed as TOML and validated against declared schemas.
- When a secrets file is missing for a component or application with a declared secrets schema, a warning is logged and an empty object is validated against the schema.
- If secrets validation fails, application start fails and the application transitions to `failed`.
- Components without secrets schemas are skipped during secrets loading.
- Secrets are loaded once at start and are not affected by `reloadConfig` or `reloadComponentConfig`.

### Context Exposure

- Validated component config is available through `context.config`, typed from the component's declared config schema.
- Validated component secrets are available through `context.secrets`, typed from the component's declared secrets schema.
- Components without config schemas do not receive config in context.
- Components without secrets schemas do not receive secrets in context.
- Validated application config is available on the application runtime.
- Validated application secrets are available on the application runtime.

### Reload

- `reloadConfig` re-reads all config files from the base directory.
- `reloadConfig` validates all files against declared schemas before applying changes.
- If any validation fails during full reload, the reload is rejected, old config persists, and a configuration error is thrown.
- On successful full validation, all config references are swapped.
- Components declaring an `onConfigReload` hook are called concurrently after config is swapped. All hooks run to completion regardless of whether siblings throw.
- If any component reload hooks throw, `reloadConfig` rejects with an `AggregateError` containing all errors and the application transitions to `failed`. The application `onConfigReload` hook is not called.
- Applications may declare an `onConfigReload` hook, called after all component reload hooks complete successfully.
- If the application `onConfigReload` hook throws, the application transitions to `failed`.
- `reloadConfig` returns void.
- `reloadConfig` is only valid in the `active` lifecycle state.
- `reloadComponentConfig` re-reads and validates a single component's config file.
- `reloadComponentConfig` accepts a component id narrowed to registered components.
- If validation fails during single-component reload, the reload is rejected, old config persists, and a configuration error is thrown.
- On successful single-component validation, only that component's config reference is swapped.
- `reloadComponentConfig` calls only the target component's `onConfigReload` hook if declared.
- `reloadComponentConfig` returns void.
- `reloadComponentConfig` is only valid in the `active` lifecycle state.

## Constraints

- Config behavior belongs to the core package.
- Config schemas must be Arktype schemas.
- Secrets schemas must be Arktype schemas.
- Config validation must occur before any component behavior receives config values.
- Secrets validation must occur before any component behavior receives secrets values.
- Core config loading must not depend on gateway-specific runtimes.
- Component config is scoped to the declaring component; components must not access other components' config.
- Component secrets are scoped to the declaring component; components must not access other components' secrets.
- Secrets are not reloaded by `reloadConfig` or `reloadComponentConfig`.

## Anticipated Changes

- Config file watching for automatic reload may be specified later.
- Remote config providers may be specified later.
- Secrets reloading may be specified separately from config reloading.

## Dangers

- Allowing unvalidated config through context would weaken typed boundaries.
- Config reload without notification hooks leaves components with stale resources tied to old config values.
- Implicit config sharing between components would create hidden coupling.
- Config reload during lifecycle transitions could leave the application in an inconsistent state.
- Secrets files must not be committed to version control.
