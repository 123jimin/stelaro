+++
id = "s0017"
title = "Discord Gateway"
tags = ["gateway", "discord"]
paths = ["packages/peranto-discord/**"]
+++

## Related Specs

- s0015: Gateways (Common)
- s0014: Discord Chatbot Example

## Types

Types are shown erased to their widest form for readability. Implementations must be as narrow as possible — e.g. `call` accepts only references from the mount's `uses` declarations. Discord.js types (`Client`, `ChatInputCommandInteraction`, `AutocompleteInteraction`, `ButtonInteraction`, `MessageReaction`, `User`, etc.) are used directly — the gateway must not redefine them.

```typescript
type CommandHandlerContext = {
    readonly interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction;
    readonly client: Client;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
};

type AutocompleteHandlerContext = {
    readonly interaction: AutocompleteInteraction;
    call(reference: ComponentCallReference, input: unknown): Promise<unknown>;
};

type CommandDefinition = {
    readonly data: SlashCommandBuilder | ContextMenuCommandBuilder;
    handle(context: CommandHandlerContext): Promisable<void>;
    autocomplete?(context: AutocompleteHandlerContext): Promisable<void>;
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
    readonly params: string[];
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

- A Discord gateway is a Peranto component that bridges Discord interactions and events to component calls.
- A gateway receives a pre-created discord.js `Client` and attaches listeners to it. The gateway does not create the client.
- Config provides `token`, `application_id`, and optional `guild_id` for dev-only command registration.

### Mount model

- A gateway composes mount groups contributed by component code via `defineDiscordMounts()`. Each mount group declares its own `uses` and optionally provides commands, events, and interactions.
- The gateway's effective `uses` is the merge of its own `uses` and all mounts' `uses`, deduplicated by reference.

### Command routing

- Slash commands and context menu commands are defined declaratively with discord.js builders (`SlashCommandBuilder`, `ContextMenuCommandBuilder`).
- The gateway registers all commands with the Discord API on start.
- `command()` is a per-element inference helper (parallel to Fastify's `route()`).
- Command handlers receive the raw discord.js interaction, the client, and a typed `call()`.
- Autocomplete handlers are co-located with their command definition. They receive the raw `AutocompleteInteraction` and `call()`.

### Event routing

- Event handlers declare which discord.js client event they listen to via the `type` field (e.g. `Events.MessageReactionAdd`).
- The handler's `event` field contains the raw arguments from the discord.js event as a tuple.
- Event handlers also receive `client` and `call()`.

### Interaction routing (persistent)

- Interaction handlers match button, select menu, and modal interactions by a custom ID glob pattern (e.g. `quote:delete:*`).
- Wildcard segments (`*`) are extracted and provided as `params` (an array of captured strings).
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
