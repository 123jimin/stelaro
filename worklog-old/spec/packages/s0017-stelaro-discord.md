+++
id = "s0017"
title = "Discord Gateway"
tags = ["gateway", "discord"]
paths = ["packages/stelaro-discord/**"]
+++

## Related Specs

- s0015: Gateways (Common)
- s0014: Discord Chatbot Example

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `call` accepts only references from the mount's `uses` declarations. Discord.js types (`Client`, `ChatInputCommandInteraction`, `AutocompleteInteraction`, `ButtonInteraction`, `MessageReaction`, `User`, etc.) are used directly — the gateway must not redefine them.

```typescript
type AnySlashCommandData = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;

type CommandHandlerContext = {
    readonly interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction;
    readonly options: unknown;
    readonly client: Client;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
};

type AutocompleteHandlerContext = {
    readonly value: string;
    readonly interaction: AutocompleteInteraction;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
};

type AutocompleteChoice = {
    readonly name: string;
    readonly value: string;
};

type AutocompleteResult = readonly string[] | readonly AutocompleteChoice[];

type AutocompleteHandler = (context: AutocompleteHandlerContext) => Promisable<AutocompleteResult>;
type AutocompleteMap = Record<string, AutocompleteHandler>;
type AutocompleteFallback = (context: { readonly interaction: AutocompleteInteraction; call: CallFn; }) => Promisable<void>;

type GuardContext = {
    readonly interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction
        | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
    readonly client: Client;
};

type Guard = (context: GuardContext) => Promisable<void>;

type KeyExtractor = (interaction: BaseInteraction) => string;

type RateLimitOptions = {
    readonly limit: number;
    readonly window_ms: number;
    readonly key?: KeyExtractor;
};

type ConcurrencyOptions = {
    readonly max: number;
    readonly key?: KeyExtractor;
};

type CommandDefinition = {
    readonly data: AnySlashCommandData | ContextMenuCommandBuilder;
    readonly options?: ComponentCallSchema;
    handle(context: CommandHandlerContext): Promisable<void>;
    readonly autocomplete?: AutocompleteMap | AutocompleteFallback;
    readonly guards?: readonly Guard[];
    readonly rate_limit?: RateLimitOptions;
    readonly concurrency?: ConcurrencyOptions;
};

type EventDefinition = {
    readonly type: string;
    handle(context: EventHandlerContext): Promisable<void>;
    readonly fetch_partials?: boolean;
};

type EventHandlerContext = {
    readonly event: unknown[];
    readonly client: Client;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
};

type InteractionDefinition = {
    readonly pattern: string;
    handle(context: InteractionHandlerContext): Promisable<void>;
    readonly guards?: readonly Guard[];
    readonly rate_limit?: RateLimitOptions;
    readonly concurrency?: ConcurrencyOptions;
};

type InteractionHandlerContext = {
    readonly interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
    readonly params: Record<string, string>;
    readonly client: Client;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
};

type DiscordMountGroup = {
    readonly uses: readonly ComponentCalls[];
    readonly commands?: readonly CommandDefinition[];
    readonly events?: readonly EventDefinition[];
    readonly interactions?: readonly InteractionDefinition[];
    readonly guards?: readonly Guard[];
};

type DiscordGatewayDefinition = {
    readonly id: ComponentId;
    readonly client: Client;
    readonly uses: readonly ComponentCalls[];
    readonly mounts?: readonly DiscordMountGroup[];
    readonly guards?: readonly Guard[];
};

function defineDiscordGateway(definition: DiscordGatewayDefinition): Component;
function defineDiscordMounts(definition: DiscordMountGroup): DiscordMountGroup;
function command(definition: CommandDefinition): CommandDefinition;
function event(definition: EventDefinition): EventDefinition;
function interaction(definition: InteractionDefinition): InteractionDefinition;

function perUser(interaction: BaseInteraction): string;
function perGuild(interaction: BaseInteraction): string;
function perChannel(interaction: BaseInteraction): string;
```

## Behavior

### Gateway definition

- A Discord gateway is a Stelaro component that bridges Discord interactions and events to component calls.
- A gateway receives a pre-created discord.js `Client` and attaches listeners to it. The gateway does not create the client.
- Config provides `token`, `application_id`, and optional `guild_id` for dev-only command registration.

### Mount model

- A gateway composes mount groups contributed by component code via `defineDiscordMounts()`. Each mount group declares its own `uses` and optionally provides commands, events, and interactions.
- The gateway's effective `uses` is the merge of its own `uses` and all mounts' `uses`, deduplicated by reference.

### Command routing

- Slash commands and context menu commands are defined declaratively with discord.js builders (`SlashCommandBuilder`, `ContextMenuCommandBuilder`). The `data` field also accepts `SlashCommandSubcommandsOnlyBuilder` and `SlashCommandOptionsOnlyBuilder` (the return types of `.addSubcommand()` and `.addStringOption()` etc.).
- The gateway registers all commands with the Discord API on start.
- `command()` is a per-element inference helper (parallel to Fastify's `route()`). It narrows `CommandHandlerContext.interaction` based on the `data` builder type: `ChatInputCommandInteraction` for slash command builders, `ContextMenuCommandInteraction` for context menu builders.
- Command definitions may declare an optional `options` field as a `ComponentCallSchema`. When present, the gateway validates slash command option data against the schema before calling the handler, and the handler receives the validated data through `context.options`.
- Command handlers receive the raw discord.js interaction, the client, and a typed `call()`.
- Autocomplete is co-located with the command definition via the `autocomplete` field. It may be either a per-option handler map (`AutocompleteMap`) keyed by option name (using `subcommand/option` qualified keys for subcommands), or a single fallback function. Map handlers receive the focused option's current `value`, the raw `AutocompleteInteraction`, and `call()`, and return an `AutocompleteResult` (string array or `{name, value}` choice array). Results are truncated and normalized by the gateway.

### Event routing

- Event handlers declare which discord.js client event they listen to via the `type` field (e.g. `Events.MessageReactionAdd`).
- The handler's `event` field contains the raw arguments from the discord.js event as a tuple.
- Event handlers also receive `client` and `call()`.

### Interaction routing (persistent)

- Interaction handlers match button, select menu, and modal interactions by a custom ID pattern with named parameters (e.g. `quote:delete:{quote_id}`).
- Named parameter segments (`{name}`) are extracted and provided as `params` (a `Record<string, string>` keyed by parameter name). Literal segments must match exactly.
- Interaction handlers also receive `client` and `call()`.
- Transient interactions (created and awaited within one handler via discord.js collectors) remain the handler's responsibility.

### Error dispatch

- When a command or interaction handler throws `UserFacingError`, the gateway replies ephemerally with `user_message`. If the interaction was already replied or deferred (`interaction.replied || interaction.deferred`), `followUp` is used instead of `reply` so the error is always ephemeral.
- Non-`UserFacingError` throws are logged without replying.
- Error dispatch does not apply to autocomplete interactions (no ephemeral reply channel).

### Guards

- A guard is a function that receives a `GuardContext` and either returns (pass) or throws `UserFacingError` (reject). The thrown error is caught by error dispatch.
- Guards attach at three levels, executed outer-to-inner: gateway → mount → handler. The first throw aborts the pipeline.
- Guards apply to commands, component interactions, and autocomplete. Events are not guarded.
- For autocomplete, a guard rejection responds with empty choices instead of an ephemeral reply.

### Rate limiting

- Commands and interaction handlers may declare a `rate_limit` with `limit`, `window_ms`, and an optional `key` extractor (default: `perUser`).
- The gateway creates one sliding-window rate limiter per definition. When `check()` returns `false`, the gateway replies ephemerally with a rate limit message and skips the handler.
- For commands with autocomplete, a separate rate limiter instance is created with the same configuration. Autocomplete and command invocations do not share quota. Rate-limited autocomplete responds with empty choices.
- Built-in key extractors: `perUser` (user id), `perGuild` (guild id or `"dm"`), `perChannel` (channel id or `"unknown"`).

### Concurrency limiting

- Commands and interaction handlers may declare a `concurrency` with `max` and optional `key` extractor (default: `perUser`).
- The gateway acquires a slot before handler execution and releases it in a `finally` block.
- One keyed concurrency limiter per definition.

### Handler execution order

For commands and interactions: guards → rate limit check → concurrency acquire → handler → concurrency release → error dispatch.

For autocomplete: guards → rate limit check → handler. On guard rejection or rate limit, respond with empty choices. No concurrency limiting.

### Auto-fetch partials

- Event definitions may set `fetch_partials: true`. When enabled, the gateway resolves any partial event arguments (objects with `partial === true` and a `fetch()` method) before the handler runs.

### Event isolation

- Event handlers sharing the same event type run concurrently and independently. One handler's rejection does not prevent siblings from executing. Errors are collected and logged after all handlers for that event type complete.

### Lifecycle

- Start: log in client via token from config, register commands with Discord API (guild-scoped if `guild_id` set, otherwise global), attach event and interaction listeners.
- Stop: remove listeners, destroy client.

## Constraints

- The gateway must not define types that parallel discord.js's own types for interactions, messages, channels, or clients.
- The gateway must not wrap discord.js reply/edit/followUp methods.
- Handlers interact with the Discord API through the raw discord.js objects, not gateway abstractions.

## Anticipated Changes

- Guard composition utilities (`allOf`, `anyOf`) may be added as plain functions.
- Mount-level or gateway-level rate limiting and concurrency (currently per-handler only).

## Dangers

- Wrapping discord.js interaction objects in gateway-specific types creates a parallel type system.
- Adding convenience helpers before the core event/command routing stabilizes risks locking in APIs that conflict with later design decisions.
- Designing the interaction routing pattern matching without real use cases risks over- or under-specifying.
