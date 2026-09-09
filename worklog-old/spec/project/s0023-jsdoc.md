+++
id = "s0023"
title = "JSDoc Documentation"
tags = ["documentation", "style"]
+++

## Behavior

### Coverage

- Every export receives a JSDoc block: functions, types, interfaces, classes, type aliases, constants.
- Interface and class members each receive their own JSDoc block.
- Internal (non-exported) functions, variables, and helpers do not receive JSDoc.
- Barrel files (`index.ts`) that only re-export do not receive JSDoc.

### Block Structure

Tags appear in this order. Separate logical groups with a blank JSDoc line.

1. Summary line
2. Extended description (0–2 sentences, only when the summary is insufficient)
3. `@typeParam` tags
4. `@param` tags
5. `@returns` or `@yields`
6. `@throws` tags
7. `@remarks` block
8. `@example` block
9. `@see` references
10. `@category` tag

### Summary Line

- Single sentence. Present tense. Starts with a verb (for functions) or describes what it IS (for types).
- No filler. Describe WHAT it does, not HOW it works.

Good:
```ts
/** Clamps a value to the inclusive range `[min, max]`. */
/** A double-ended queue with amortized O(1) operations at both ends. */
/** Returns the provided value unchanged. */
```

Bad:
```ts
/** This function clamps a value. */         // filler "This function"
/** Helper that checks permissions. */       // "Helper" adds nothing
/** Used to create a rate limiter. */        // passive, vague
```

### Extended Description

- Only present when the summary alone does not convey behavioral expectations.
- 1–2 additional sentences. Describe behavior and constraints, not implementation.

```ts
/**
 * Wraps an async function to enforce a minimum delay between consecutive executions.
 *
 * Additional calls are queued and processed in FIFO order.
 */
```

### `@typeParam`

- Present on every generic. Format: `@typeParam Name - Description fragment`.
- Terse — typically 2–5 words. Include defaults in parentheses.

```ts
/** @typeParam T - Item type. */
/** @typeParam E - Error type (default: `Error`). */
```

### `@param`

- Format: `@param name - Description fragment`.
- The dash separator is always present.
- Include defaults inline: `(default: \`true\`)`.
- For callbacks, give the signature inline: `Async callback \`(batch, index) => Promise<void>\``.

```ts
/** @param key - Rate limiter bucket key. */
/** @param max_concurrent - Maximum concurrent acquires per key (default: `1`). */
```

### `@returns`

- Present on every function that returns a value. Omitted for void.
- Brief fragment. Use backtick-quoted values for specific returns.

```ts
/** @returns `true` if the call is within the limit. */
/** @returns A release function that frees the slot. */
```

### `@throws`

- Present when a function can throw under documented conditions.
- Use `{ErrorType}` when the thrown type is known.

```ts
/** @throws {LifecycleStateError} If the application is not in the `active` state. */
/** @throws {ConfigValidationError} If the parsed config fails schema validation. */
```

### `@remarks`

- For caveats, edge-case behavior, and "gotcha" documentation.
- Uses prose with periods. May use markdown bullet lists.

```ts
/**
 * @remarks
 * Rejections are not cached. To cache negative results, resolve with `null`.
 */
```

```ts
/**
 * @remarks
 * - Does not mutate the original object.
 * - `undefined` values in the patch are ignored; `null` values overwrite.
 */
```

### `@example`

- Present on public functions where usage is not obvious from the signature.
- Uses a fenced TypeScript code block. Minimal but complete.
- Inline comments show output: `// 10`.

```ts
/**
 * @example
 * ```ts
 * const limiter = createRateLimiter(3, 1000);
 * limiter.check("user-1"); // true
 * limiter.check("user-1"); // true
 * limiter.check("user-1"); // true
 * limiter.check("user-1"); // false
 * ```
 */
```

- May be omitted on trivial single-purpose functions (e.g., error constructors, identity wrappers) and on type/interface definitions where the types speak for themselves.

### `@see`

- Cross-references related functions or types. Uses `{@link Name}` syntax.

```ts
/** @see {@link OptionalFileReader} for the variant that returns `null` on missing files. */
```

### `@category`

- Groups exports by domain for documentation generators.
- Placed last in the block.
- Each export belongs to exactly one category.

Stelaro core categories: `Application`, `Component`, `Configuration`, `Data`, `Errors`, `Fluent FS`, `Utility`.

```ts
/** @category Application */
/** @category Errors */
```

### `{@link}` Inline References

- Use within descriptions, `@returns`, and `@see` to cross-reference.
- Avoid in `@param` descriptions — keep parameter docs self-contained.

```ts
/** A function wrapper returned by {@link cached} with caching capabilities. */
/** @returns A {@link CachedFunction} wrapping the original. */
```

### Trivial Members

- Interface/class members with obvious purpose use single-line JSDoc.

```ts
/** Number of items in the deque. */
get length(): number;
/** Clears all cached entries. */
clearCache(): void;
```

### Type Aliases

- Single-line JSDoc describing what the type represents.

```ts
/** A string identifier for a component within an application. */
export type ComponentId = string;
```

## Constraints

- No `@author`, `@since`, `@module`, `@internal`, `@public`, `@private`, `@protected`, or `@default` tags.
- Defaults are noted inline in `@param` descriptions, not via `@default`.
- No trailing periods on fragment descriptions (`@param`, `@typeParam`, `@returns`). Periods are used in `@remarks` and extended descriptions which read as prose.
- Backticks for all inline code references: types, values, function names.

## Anticipated Changes

- Categories may expand as gateway packages are documented.

## Dangers

- Documenting implementation details couples docs to code structure and creates maintenance burden when internals change.
- Excessive boilerplate JSDoc (restating the type signature in prose) adds noise without value.
