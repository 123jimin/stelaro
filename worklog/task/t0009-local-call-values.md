+++
id = "t0009"
title = "Local call values"
tags = ["component", "fastify"]
modifies = ["s0003", "s0016"]
status = "active"
+++

# Local call values

Let component calls carry values that only make sense inside the process, such as a connection
pool, a client object, or a callback, and let gateways refuse to expose such calls. Arktype's
`type.unknown.as<T>()` already passes such a value unchecked and typed as `T`, but neither a gateway
nor a reader can tell it from a checked schema: a gateway cannot refuse it, and a reader cannot tell
a deliberate pass-through from a missing check.

## Design

`@jiminp/stelaro` exports two schema factories, `defineLocalInput<T>()` and
`defineLocalOutput<T>()`, whose schemas `exposeCalls` in stelaro-fastify recognizes and refuses.
Each names the side of the call it is declared for. The rules are in the spec changes below.

```ts
const PoolCalls = defineComponentCalls("pool", {
    getPool: {input: EmptyInput, output: defineLocalOutput<ConnectionPool>()},
});
```

`exposeCalls` refuses both. An exposed local input would hand a request body to a handler without
any check.

Marking the schema, not the call, leaves call declarations, references, `mergeComponentCalls`, and
dispatch unchanged. A separate kind of call would add a second declaration shape that each of them
would have to handle.

Handlers may keep local inputs after the call returns. Stelaro cannot detect keeping, so a rule
against it could not be enforced.

## Spec changes

- s0003 Types: add `function defineLocalInput<T>(): ComponentCallSchema;` and
  `function defineLocalOutput<T>(): ComponentCallSchema;` after `EmptyInput`.
- s0003 Behavior: add after the `EmptyInput` bullet: "`defineLocalInput<T>()` and
  `defineLocalOutput<T>()` return a call input or output schema for values of type `T` that never
  leave the process. Dispatch passes such a value through without checking it. The component that
  creates such a value disposes of it. A handler may keep a local input after the call returns; the
  caller's component stops first, so it withdraws the input in its stop hook when the input must not
  be used after that."
- s0003 Constraints: "Call inputs and outputs MUST use Arktype schemas and remain typed through
  declaration, handler dispatch, and `context.call`." becomes "Call inputs and outputs MUST use
  Arktype schemas or local schemas (`defineLocalInput`, `defineLocalOutput`) and remain typed
  through declaration, handler dispatch, and `context.call`."
- s0016 Call transport: "`exposeCalls` throws `InvalidCallEndpointError` for a call name with
  characters other than ASCII letters, digits, `_`, and `-`, or a path not under `${base}/`."
  becomes "`exposeCalls` throws `InvalidCallEndpointError` for a call name with characters other
  than ASCII letters, digits, `_`, and `-`, a path not under `${base}/`, or a local input or output
  schema (s0003)."

## Risks

- Hot module replacement (s0006) that replaces a component does not update the references other
  components already hold.

## Completion conditions

- s0003 and s0016 state the approved behavior.
- `@jiminp/stelaro` exports both factories with TSDoc. Tests show that dispatch passes any value
  through unchanged in both directions, that callers and handlers see `T`, and that checked calls
  behave as before.
- `exposeCalls` throws `InvalidCallEndpointError` for a local input and for a local output, with
  tests.
- `pnpm build`, `pnpm lint`, and `pnpm test` pass.

## Out of scope

- The browser call client, which addresses calls by component id and name and sees no schemas.
- The Discord gateway, which exposes no calls.
