+++
id = "s0004"
title = "Public API Documentation"
tags = ["documentation", "style"]
paths = ["packages/stelaro/src/**", "packages/stelaro-pino/src/**"]
+++

# Public API Documentation

## Coverage

- Every exported function, type, interface, class, type alias, and constant has JSDoc.
  - Interface and class members are documented individually.
- Internal helpers and re-export-only barrel files are not documented.

## Structure and prose

- Blocks follow this order. Separate logical groups with a blank JSDoc line.
  - Use a summary, an optional extended description, `@typeParam`, `@param`, `@returns` or `@yields`, `@throws`, `@remarks`, `@example`, `@see`, and `@category`.
- A summary is one present-tense sentence. Function summaries start with a verb.
  - Type summaries state what the type is.
  - Describe behavior without filler or implementation details.
- An extended description appears only when the summary cannot express relevant behavior or constraints.
- Trivial members and type aliases use a single-line description.

## Tags

- Every generic has `@typeParam Name - Description`.
- Every parameter has `@param name - Description`.
- Descriptions are terse fragments and include defaults inline as `(default: value)`.
- Callback parameters show their signature.
- Every non-void function has `@returns`.
- Generators use `@yields`.
- Document failure conditions with `@throws {ErrorType}` when the type is known.
- Caveats and edge cases use prose under `@remarks`.
- Non-obvious public functions have a minimal complete fenced TypeScript `@example`.
  - Trivial functions and self-explanatory types may omit it.
- `@see` and inline cross-references use `{@link Name}`.
  - Parameter descriptions are self-contained and use no links.
- Every export has exactly one final `@category`.
  - Core categories are `Application`, `Component`, `Configuration`, `Data`, `Errors`, `Fluent FS`, and `Utility`.

## Constraints

- Do not use `@author`, `@since`, `@module`, `@internal`, `@public`, `@private`, `@protected`, or `@default`.
- Fragment tags (`@param`, `@typeParam`, `@returns`) have no trailing period. Prose sections do.
- Inline code references use backticks.
- Documentation MUST describe public behavior without restating signatures or implementation details.
