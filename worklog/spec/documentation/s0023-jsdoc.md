+++
id = "s0023"
title = "JSDoc Documentation"
tags = ["documentation", "style"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0023.

## Behavior

### Coverage

- Every exported function, type, interface, class, type alias, and constant has
  JSDoc. Interface and class members are documented individually.
- Internal helpers and re-export-only barrel files are not documented.

### Structure and prose

- Blocks use this order, separating logical groups with a blank JSDoc line:
  summary; optional extended description; `@typeParam`; `@param`; `@returns`
  or `@yields`; `@throws`; `@remarks`; `@example`; `@see`; `@category`.
- A summary is one present-tense sentence: functions start with a verb; types
  state what they are. It describes behavior without filler or implementation.
- An extended description is at most two sentences and appears only when the
  summary cannot express relevant behavior or constraints.
- Trivial members and type aliases use a single-line description.

### Tags

- Every generic has `@typeParam Name - Description`; every parameter has
  `@param name - Description`. Descriptions are terse fragments, use a dash,
  and include defaults inline as `(default: value)`. Callback parameters show
  their signature.
- Every non-void function has `@returns`; generators use `@yields`. Documented
  failure conditions use `@throws {ErrorType}` when the type is known.
- Caveats and edge cases use prose under `@remarks`.
- Non-obvious public functions have a minimal complete fenced TypeScript
  `@example`; trivial functions and self-explanatory types may omit it.
- `@see` and inline cross-references use `{@link Name}`. Parameter descriptions
  remain self-contained and do not use links.
- Every export has exactly one final `@category`. Core categories are
  `Application`, `Component`, `Configuration`, `Data`, `Errors`, `Fluent FS`,
  and `Utility`.

## Constraints

- Do not use `@author`, `@since`, `@module`, `@internal`, `@public`, `@private`,
  `@protected`, or `@default`.
- Defaults belong inline in parameter descriptions.
- Fragment tags (`@param`, `@typeParam`, `@returns`) have no trailing period;
  prose sections do.
- Inline code references use backticks.
- Documentation MUST describe public behavior rather than restating signatures
  or implementation details.

## Anticipated Changes

- Gateway packages may add categories.
