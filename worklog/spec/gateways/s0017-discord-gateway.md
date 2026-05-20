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

type CommandDefinition = {
    readonly data: AnySlashCommandData | ContextMenuCommandBuilder;
    readonly options?: ComponentCallSchema;
    handle(context: CommandHandlerContext): Promisable<void>;
    readonly autocomplete?: AutocompleteMap | AutocompleteFallback;
};

type EventDefinition = {
    readonly type: string;
    handle(context: EventHandlerContext): Promisable<void>;
};

type EventHandlerContext = {
    readonly event: unknown[];
    readonly client: Client;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
};

type InteractionDefinition = {
    readonly pattern: string;
    handle(context: InteractionHandlerContext): Promisable<void>;
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
};

type DiscordGatewayDefinition = {
    readonly id: ComponentId;
    readonly client: Client;
    readonly uses: readonly ComponentCalls[];
    readonly mounts?: readonly DiscordMountGroup[];
};

function defineDiscordGateway(definition: DiscordGatewayDefinition): Component;
function defineDiscordMounts(definition: DiscordMountGroup): DiscordMountGroup;
function command(definition: CommandDefinition): CommandDefinition;
function event(definition: EventDefinition): EventDefinition;
function interaction(definition: InteractionDefinition): InteractionDefinition;
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

### Lifecycle

- Start: log in client via token from config, register commands with Discord API (guild-scoped if `guild_id` set, otherwise global), attach event and interaction listeners.
- Stop: remove listeners, destroy client.

## Constraints

- The gateway must not define types that parallel discord.js's own types for interactions, messages, channels, or clients.
- The gateway must not wrap discord.js reply/edit/followUp methods.
- Handlers interact with the Discord API through the raw discord.js objects, not gateway abstractions.

## Anticipated Changes

- Additional helper functions may be introduced if common patterns emerge across examples.

## Dangers

- Wrapping discord.js interaction objects in gateway-specific types creates a parallel type system.
- Adding convenience helpers before the core event/command routing stabilizes risks locking in APIs that conflict with later design decisions.
- Designing the interaction routing pattern matching without real use cases risks over- or under-specifying.
