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

## Behavior

### Sources

- Application configuration is loaded from `config.toml` within the base directory.
- Component configuration is loaded from `{component_id}/config.toml` within the base directory.
- The default base directory is the working directory.
- The base directory path may be overridden at application creation.

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

### Context Exposure

- Validated component config is available through `context.config`, typed from the component's declared config schema.
- Components without config schemas do not receive config in context.
- Validated application config is available on the application runtime.

### Reload

- `reloadConfig` re-reads all config files from the base directory.
- `reloadConfig` validates all files against declared schemas before applying changes.
- If any validation fails during full reload, the reload is rejected, old config persists, and a configuration error is thrown.
- On successful full validation, all config references are swapped.
- Components declaring an `onConfigReload` hook are called concurrently after config is swapped.
- Applications may declare an `onConfigReload` hook, called after all component reload hooks.
- If any reload hook throws, the application transitions to `failed`.
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
- Config validation must occur before any component behavior receives config values.
- Core config loading must not depend on gateway-specific runtimes.
- Component config is scoped to the declaring component; components must not access other components' config.

## Anticipated Changes

- Config file watching for automatic reload may be specified later.
- Environment-specific config overlays may be specified later.
- Secrets management may be layered on top of config later.
- Remote config providers may be specified later.

## Dangers

- Allowing unvalidated config through context would weaken typed boundaries.
- Config reload without notification hooks leaves components with stale resources tied to old config values.
- Implicit config sharing between components would create hidden coupling.
- Config reload during lifecycle transitions could leave the application in an inconsistent state.
