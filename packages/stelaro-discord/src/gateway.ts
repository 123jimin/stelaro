import {
    type AnyComponentCalls,
    type ComponentCallFn,
    type ComponentId,
    type ConcurrencyLimiter,
    createConcurrencyLimiter,
    createRateLimiter,
    defineComponent,
    defineComponentCalls,
    type RateLimiter,
    UserFacingError,
} from "@jiminp/stelaro";
import {multimapAdd, type Promisable} from "@jiminp/tooltool";
import {type as schema} from "arktype";
import {
    ApplicationCommandType,
    type AutocompleteInteraction,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type Client,
    type ClientEvents,
    Events,
    type MessageContextMenuCommandInteraction,
    type ModalSubmitInteraction,
    type RepliableInteraction,
    REST,
    type RESTPostAPIApplicationCommandsJSONBody,
    Routes,
    type StringSelectMenuInteraction,
    type UserContextMenuCommandInteraction,
} from "discord.js";

import {
    type CommandDefinition,
    extractCommandOptions,
    normalizeAutocompleteResult,
} from "./command.ts";
import type {EventDefinition} from "./event.ts";
import {
    type CompiledPattern,
    compilePattern,
    type InteractionDefinition,
    matchPattern,
} from "./interaction.ts";
import type {ConcurrencyOptions} from "./middleware/concurrency.ts";
import {type Guard, type GuardContext, runGuards} from "./middleware/guard.ts";
import {type KeyExtractor, perUser} from "./middleware/key.ts";
import {RATE_LIMIT_MESSAGE, type RateLimitOptions} from "./middleware/rate-limit.ts";
import {replyUserError} from "./middleware/reply.ts";
import type {DiscordMountGroup} from "./mount.ts";
import {resolvePartials} from "./partial.ts";

const DiscordGatewayConfig = schema({
    "application_id": "string",
    "guild_id?": "string",
});

const DiscordGatewaySecrets = schema({
    token: "string",
});

type Pipeline = {
    readonly guards: readonly Guard[];
    readonly rate_limiter: RateLimiter | null;
    readonly rate_limit_key: KeyExtractor;
    readonly concurrency_limiter: ConcurrencyLimiter | null;
    readonly concurrency_key: KeyExtractor;
};

type CommandEntry = Pipeline & {
    readonly definition: CommandDefinition;
    readonly data: RESTPostAPIApplicationCommandsJSONBody;
    readonly autocomplete_rate_limiter: RateLimiter | null;
};

type InteractionEntry = Pipeline & {
    readonly definition: InteractionDefinition;
    readonly compiled: CompiledPattern;
};

function createPipeline(
    outer_guards: readonly Guard[],
    definition: {
        readonly guards?: readonly Guard[];
        readonly rate_limit?: RateLimitOptions;
        readonly concurrency?: ConcurrencyOptions;
    },
): Pipeline {
    const {rate_limit, concurrency} = definition;
    return {
        guards: [...outer_guards, ...(definition.guards ?? [])],
        rate_limiter: rate_limit != null ? createRateLimiter(rate_limit.limit, rate_limit.window_ms) : null,
        rate_limit_key: rate_limit?.key ?? perUser,
        concurrency_limiter: concurrency != null ? createConcurrencyLimiter(concurrency.max) : null,
        concurrency_key: concurrency?.key ?? perUser,
    };
}

function commandKey(type: ApplicationCommandType, name: string): string {
    return `${type}:${name}`;
}

/**
 * Declares a Discord gateway component with its id, client, and mount groups.
 *
 * @typeParam TUses - Directly declared component call surfaces (default: `readonly AnyComponentCalls[]`)
 * @typeParam TMounts - Mount groups contributing commands, events, and interactions (default: `readonly DiscordMountGroup[]`)
 * @category Gateway
 */
export type DiscordGatewayDefinition<
    TUses extends readonly AnyComponentCalls[] = readonly AnyComponentCalls[],
    TMounts extends readonly DiscordMountGroup[] = readonly DiscordMountGroup[],
> = {
    /** Component id for this gateway */
    readonly id: ComponentId;
    /** Discord.js client instance */
    readonly client: Client;
    /** Directly declared component call surfaces */
    readonly uses: TUses;
    /** Mount groups providing commands, events, and interactions */
    readonly mounts?: TMounts;
    /** Guards applied to all commands and interactions in this gateway */
    readonly guards?: readonly Guard[];
};

/**
 * Creates a stelaro component that bridges a discord.js client to its mounts' handlers.
 *
 * Start registers the commands, attaches event and interaction listeners, and logs in; stop
 * removes those listeners and destroys the client.
 *
 * @typeParam TUses - Directly declared component call surfaces
 * @typeParam TMounts - Mount groups contributing commands, events, and interactions
 * @param definition - Gateway definition
 * @returns A stelaro component definition
 * @throws {Error} If two commands share a type and name, or an interaction pattern is malformed
 *
 * @example
 * ```ts
 * export const DiscordGateway = defineDiscordGateway({
 *     id: "discord",
 *     client: new Client({intents: [GatewayIntentBits.Guilds]}),
 *     uses: [],
 *     mounts: [QuotesMounts],
 * });
 * ```
 *
 * @category Gateway
 */
export function defineDiscordGateway<
    const TUses extends readonly AnyComponentCalls[],
    const TMounts extends readonly DiscordMountGroup[],
>(definition: DiscordGatewayDefinition<TUses, TMounts>) {
    const gateway_calls = defineComponentCalls(definition.id, {});
    const client = definition.client;

    const all_uses = [...new Set([
        ...definition.uses,
        ...(definition.mounts ?? []).flatMap((m) => m.uses),
    ])];

    const command_entries = new Map<string, CommandEntry>();
    const interaction_entries: InteractionEntry[] = [];
    const events_by_type = new Map<keyof ClientEvents, EventDefinition[]>();

    for(const mount of definition.mounts ?? []) {
        const mount_guards = [...(definition.guards ?? []), ...(mount.guards ?? [])];

        for(const cmd of mount.commands ?? []) {
            const data = cmd.data.toJSON();
            const type = data.type ?? ApplicationCommandType.ChatInput;
            const key = commandKey(type, data.name);
            if(command_entries.has(key)) {
                throw new Error(`Duplicate Discord command "${data.name}" of type ${type}.`);
            }
            command_entries.set(key, {
                ...createPipeline(mount_guards, cmd),
                definition: cmd,
                data,
                autocomplete_rate_limiter: cmd.autocomplete != null && cmd.rate_limit != null
                    ? createRateLimiter(cmd.rate_limit.limit, cmd.rate_limit.window_ms)
                    : null,
            });
        }

        for(const def of mount.interactions ?? []) {
            interaction_entries.push({
                ...createPipeline(mount_guards, def),
                definition: def,
                compiled: compilePattern(def.pattern),
            });
        }

        for(const event_def of mount.events ?? []) {
            multimapAdd(events_by_type, event_def.type, event_def);
        }
    }

    const detachers: (() => void)[] = [];

    function listen<TEvent extends keyof ClientEvents>(
        type: TEvent,
        listener: (...args: ClientEvents[TEvent]) => Promise<void>,
    ): void {
        client.on(type, listener);
        detachers.push(() => { client.off(type, listener); });
    }

    function detachListeners(): void {
        for(const detach of detachers.splice(0)) detach();
    }

    return defineComponent({
        calls: gateway_calls,
        uses: all_uses,
        config: DiscordGatewayConfig,
        secrets: DiscordGatewaySecrets,
        handlers: {},

        async start(context) {
            const call: ComponentCallFn<readonly AnyComponentCalls[]> = (reference, input) => context.call(reference, input);

            const rest = new REST({version: "10"}).setToken(context.secrets.token);
            const command_data = [...command_entries.values()].map((entry) => entry.data);
            const route = context.config.guild_id != null
                ? Routes.applicationGuildCommands(context.config.application_id, context.config.guild_id)
                : Routes.applicationCommands(context.config.application_id);
            await rest.put(route, {body: command_data});
            context.log.info(`Registered ${command_data.length} command(s).`);

            listen(Events.InteractionCreate, async (interaction) => {
                try {
                    if(interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
                        await dispatchCommand(interaction);
                    } else if(interaction.isAutocomplete()) {
                        await dispatchAutocomplete(interaction);
                    } else if(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
                        await dispatchComponentInteraction(interaction);
                    }
                } catch (error) {
                    if(!(error instanceof UserFacingError)) {
                        context.log.error("Unhandled error in interaction handler:", error);
                    } else if(interaction.isRepliable()) {
                        await replyUserError(interaction, error.user_message, context.log);
                    }
                }
            });

            for(const [type, defs] of events_by_type) {
                listen(type, async (...args) => {
                    const results = await Promise.allSettled(defs.map(async (event_def) => {
                        const event = event_def.fetch_partials ? await resolvePartials<unknown>(args) as typeof args : args;
                        await event_def.handle({event, client, call});
                    }));
                    for(const result of results) {
                        if(result.status === "rejected") {
                            context.log.error(`Unhandled error in event handler (${type}):`, result.reason);
                        }
                    }
                });
            }

            try {
                await client.login(context.secrets.token);
            } catch (error) {
                detachListeners();
                throw error;
            }
            context.log.info("Discord client logged in.");

            async function runPipeline(
                pipeline: Pipeline,
                interaction: Extract<RepliableInteraction, GuardContext["interaction"]>,
                handle: () => Promisable<void>,
            ): Promise<void> {
                await runGuards(pipeline.guards, {interaction, client});

                if(pipeline.rate_limiter != null && !pipeline.rate_limiter.check(pipeline.rate_limit_key(interaction))) {
                    await replyUserError(interaction, RATE_LIMIT_MESSAGE, context.log);
                    return;
                }

                const release = pipeline.concurrency_limiter != null
                    ? await pipeline.concurrency_limiter.acquire(pipeline.concurrency_key(interaction))
                    : null;
                try {
                    await handle();
                } finally {
                    release?.();
                }
            }

            async function dispatchCommand(
                interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction,
            ): Promise<void> {
                const entry = command_entries.get(commandKey(interaction.commandType, interaction.commandName));
                if(entry == null) return;
                const {definition: cmd} = entry;

                await runPipeline(entry, interaction, () => {
                    const options = cmd.options != null && interaction.isChatInputCommand()
                        ? cmd.options.assert(extractCommandOptions(interaction))
                        : null;
                    return cmd.handle({interaction, options, client, call});
                });
            }

            async function dispatchAutocomplete(
                interaction: AutocompleteInteraction,
            ): Promise<void> {
                const entry = command_entries.get(commandKey(interaction.commandType, interaction.commandName));
                const autocomplete = entry?.definition.autocomplete;
                if(entry == null || autocomplete == null) return;

                try {
                    await runGuards(entry.guards, {interaction, client});
                } catch (error) {
                    if(error instanceof UserFacingError) {
                        await interaction.respond([]);
                        return;
                    }
                    throw error;
                }

                if(entry.autocomplete_rate_limiter != null
                    && !entry.autocomplete_rate_limiter.check(entry.rate_limit_key(interaction))) {
                    await interaction.respond([]);
                    return;
                }

                if(typeof autocomplete === "function") {
                    await autocomplete({interaction, call});
                    return;
                }

                const focused = interaction.options.getFocused(true);
                const sub = interaction.options.getSubcommand(false);
                const handler = (sub != null ? autocomplete[`${sub}/${focused.name}`] : null) ?? autocomplete[focused.name];
                if(handler == null) return;

                const result = await handler({value: focused.value, interaction, call});
                await interaction.respond(normalizeAutocompleteResult(result));
            }

            async function dispatchComponentInteraction(
                interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
            ): Promise<void> {
                for(const entry of interaction_entries) {
                    const params = matchPattern(entry.compiled, interaction.customId);
                    if(params == null) continue;

                    await runPipeline(entry, interaction, () => entry.definition.handle({interaction, params, client, call}));
                    return;
                }
            }
        },

        async stop(context) {
            detachListeners();
            await client.destroy();
            context.log.info("Discord client destroyed.");
        },
    });
}
