+++
id = "s0017"
title = "Discord Gateway"
tags = ["gateway", "discord"]
paths = ["packages/stelaro-discord/**"]
+++

NEEDS APPROVAL: Migrated and condensed from legacy s0017. The complete handler
pipeline remains in this spec.

## Types

Types are shown at their widest readable form. Implementations MUST narrow
`call` to each mount's `uses`, infer command interaction/options from builders
and schemas, preserve event tuples, and use discord.js types directly.

```typescript
type AnySlashCommandData = SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;

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

type AutocompleteChoice = { readonly name: string; readonly value: string };
type AutocompleteResult = readonly string[] | readonly AutocompleteChoice[];
type AutocompleteHandler = (context: AutocompleteHandlerContext) => Promisable<AutocompleteResult>;
type AutocompleteMap = Record<string, AutocompleteHandler>;
type AutocompleteFallback = (context: {
    readonly interaction: AutocompleteInteraction;
    call: CallFn;
}) => Promisable<void>;

type GuardContext = {
    readonly interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction
        | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
    readonly client: Client;
};
type Guard = (context: GuardContext) => Promisable<void>;
type KeyExtractor = (interaction: BaseInteraction) => string;
type RateLimitOptions = { readonly limit: number; readonly window_ms: number; readonly key?: KeyExtractor };
type ConcurrencyOptions = { readonly max: number; readonly key?: KeyExtractor };

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

### Gateway and mounts

- The gateway receives a pre-created discord.js `Client`, attaches listeners,
  and bridges Discord interactions/events to component calls. It does not
  create the client.
- Config provides `token`, `application_id`, and optional `guild_id` for
  development-only command registration.
- Mount groups contribute commands, events, interactions, guards, and `uses`.
  Effective dependencies merge gateway and mount `uses`, deduplicated by
  reference.

### Commands and autocomplete

- Commands use discord.js slash/context-menu builders and register on start.
  With `guild_id` registration is guild-scoped; otherwise it is global.
- `command()` narrows the interaction from the builder type. An optional
  Arktype-compatible options schema validates before handling and types
  `context.options`.
- Handlers receive the raw interaction, client, and typed `call`.
- Autocomplete is either a map keyed by option name (`subcommand/option` for
  subcommands) or one fallback. Map handlers receive the focused value,
  interaction, and `call`, then return strings or `{ name, value }` choices;
  the gateway normalizes and truncates results.

### Events and persistent interactions

- Events select a discord.js client event by `type`; handlers receive its raw
  argument tuple, client, and `call`.
- Event handlers for one type run concurrently and independently. Rejections
  are collected and logged after all siblings finish.
- `fetch_partials: true` fetches partial arguments that expose `fetch()` before
  invoking the event handler.
- Persistent button, select-menu, and modal handlers match custom-id patterns.
  `{name}` segments become string `params`; literal segments match exactly.
  Transient collector interactions remain the originating handler's concern.

### Guards and limits

- Guards pass by returning and reject by throwing `UserFacingError`. Gateway,
  mount, then handler guards run outer-to-inner; the first error aborts.
  Guards apply to commands, persistent interactions, and autocomplete, not
  events. Autocomplete rejection returns empty choices.
- Commands and persistent interactions may define a per-definition
  sliding-window rate limit and keyed concurrency limit; both default to
  `perUser`. Autocomplete uses a separate rate-limit instance and no
  concurrency limit. Rejection returns an ephemeral message, or empty choices
  for autocomplete.
- `perUser`, `perGuild`, and `perChannel` return user id, guild id or `dm`, and
  channel id or `unknown`, respectively.

### Execution and errors

- Command and interaction order is: guards, rate check, concurrency acquire,
  handler, concurrency release in `finally`, then error dispatch.
- Autocomplete order is: guards, rate check, handler.
- A handler `UserFacingError` yields an ephemeral `reply`, or `followUp` when
  already replied/deferred. Other errors are logged without replying.
  Autocomplete has no ephemeral error dispatch.

### Lifecycle

- Start logs in with the configured token, registers commands, and attaches
  event and interaction listeners. Stop removes listeners and destroys the
  client.

## Constraints

- The gateway MUST NOT parallel discord.js interaction, message, channel, or
  client types, or wrap reply/edit/follow-up methods.
- Handlers MUST use raw discord.js objects for Discord API access.

## Anticipated Changes

- Plain guard combinators and mount/gateway-level rate or concurrency limits
  may be added.
