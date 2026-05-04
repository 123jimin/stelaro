+++
id = "s0008"
title = "Configuration"
tags = ["config", "application", "component", "context"]
paths = ["packages/peranto/src/config/**"]
+++

## Related Specs

- s0002: Application
- s0003: Component
- s0004: Context

## Behavior

### Sources

- UNIMPLEMENTED Application configuration is loaded from a TOML file named `application.toml` within the config directory.
- UNIMPLEMENTED Component configuration is loaded from per-component TOML files named `{component_id}.toml` within the config directory.
- UNIMPLEMENTED The default config directory is `config/` relative to the working directory.
- UNIMPLEMENTED The config directory path may be overridden at application creation.

### Schema Declaration

- UNIMPLEMENTED Applications may declare a config schema for application-level configuration.
- UNIMPLEMENTED Components may declare a config schema for component-level configuration.
- UNIMPLEMENTED Config schemas use Arktype.
- UNIMPLEMENTED Default values for missing config fields are determined by the Arktype schema.

### Loading and Validation

- UNIMPLEMENTED Configuration is loaded and validated during application start, before component start hooks run.
- UNIMPLEMENTED Config files are parsed as TOML and validated against declared schemas.
- UNIMPLEMENTED If any config validation fails, application start fails and the application transitions to `failed`.
- UNIMPLEMENTED Components without config schemas do not require a config file and are skipped during config loading.
- UNIMPLEMENTED Applications without a config schema do not require an application config file.

### Context Exposure

- UNIMPLEMENTED Validated component config is available through `context.config`, typed from the component's declared config schema.
- UNIMPLEMENTED Components without config schemas do not receive config in context.
- UNIMPLEMENTED Validated application config is available on the application runtime.

### Reload

- UNIMPLEMENTED `reloadConfig` re-reads all config files from the config directory.
- UNIMPLEMENTED `reloadConfig` validates all files against declared schemas before applying changes.
- UNIMPLEMENTED If any validation fails during full reload, the reload is rejected, old config persists, and a configuration error is thrown.
- UNIMPLEMENTED On successful full validation, all config references are swapped.
- UNIMPLEMENTED Components declaring an `onConfigReload` hook are called in topological order after config is swapped.
- UNIMPLEMENTED Applications may declare an `onConfigReload` hook, called after all component reload hooks.
- UNIMPLEMENTED If any reload hook throws, the application transitions to `failed`.
- UNIMPLEMENTED `reloadConfig` returns void.
- UNIMPLEMENTED `reloadConfig` is only valid in the `active` lifecycle state.
- UNIMPLEMENTED `reloadComponentConfig` re-reads and validates a single component's config file.
- UNIMPLEMENTED `reloadComponentConfig` accepts a component id narrowed to registered components.
- UNIMPLEMENTED If validation fails during single-component reload, the reload is rejected, old config persists, and a configuration error is thrown.
- UNIMPLEMENTED On successful single-component validation, only that component's config reference is swapped.
- UNIMPLEMENTED `reloadComponentConfig` calls only the target component's `onConfigReload` hook if declared.
- UNIMPLEMENTED `reloadComponentConfig` returns void.
- UNIMPLEMENTED `reloadComponentConfig` is only valid in the `active` lifecycle state.

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
