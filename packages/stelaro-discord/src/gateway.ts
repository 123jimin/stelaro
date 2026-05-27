import {
    type AnyComponentCalls,
    type ComponentCallSchema,
    type ComponentId,
    type ConcurrencyLimiter,
    createConcurrencyLimiter,
    createRateLimiter,
    defineComponent,
    defineComponentCalls,
    type RateLimiter,
    UserFacingError,
} from "@jiminp/stelaro";
import {type as schema} from "arktype";
import {
    type AutocompleteInteraction,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type Client,
    type ContextMenuCommandInteraction,
    Events,
    type ModalSubmitInteraction,
    REST,
    Routes,
    type StringSelectMenuInteraction,
} from "discord.js";

import {
    type AutocompleteMap,
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
import {type Guard, runGuards} from "./middleware/guard.ts";
import {type KeyExtractor, perUser} from "./middleware/key.ts";
import {RATE_LIMIT_MESSAGE} from "./middleware/rate-limit.ts";
import {type RepliableInteraction, replyUserError} from "./middleware/reply.ts";
import type {DiscordMountGroup} from "./mount.ts";
import {resolvePartials} from "./partial.ts";

const DiscordGatewayConfig = schema({
    "application_id": "string",
    "guild_id?": "string",
});

const DiscordGatewaySecrets = schema({
    token: "string",
});

type CommandEntry = {
    readonly definition: CommandDefinition;
    readonly guards: readonly Guard[];
    readonly rate_limiter: RateLimiter | null;
    readonly autocomplete_rate_limiter: RateLimiter | null;
    readonly rate_limit_key: KeyExtractor;
    readonly concurrency_limiter: ConcurrencyLimiter | null;
    readonly concurrency_key: KeyExtractor;
};

type InteractionEntry = {
    readonly definition: InteractionDefinition;
    readonly compiled: CompiledPattern;
    readonly guards: readonly Guard[];
    readonly rate_limiter: RateLimiter | null;
    readonly rate_limit_key: KeyExtractor;
    readonly concurrency_limiter: ConcurrencyLimiter | null;
    readonly concurrency_key: KeyExtractor;
};

/**
 * Declares a Discord gateway component with its id, client, and mount groups.
 *
 * @typeParam TUses - Directly declared component call surfaces
 * @typeParam TMounts - Mount groups contributing commands, events, and interactions
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
 * Creates a stelaro component from a Discord gateway definition.
 *
 * Registers all commands with the Discord API on start, wires up event and
 * interaction dispatch with the middleware pipeline, and logs in the client.
 *
 * @param definition - Gateway definition
 * @returns A stelaro component definition
 * @category Gateway
 */
export function defineDiscordGateway<
    const TUses extends readonly AnyComponentCalls[],
    const TMounts extends readonly DiscordMountGroup[],
>(definition: DiscordGatewayDefinition<TUses, TMounts>) {
    const gateway_calls = defineComponentCalls({
        id: definition.id,
        calls: {},
    });

    const all_uses = [...new Set([
        ...definition.uses,
        ...(definition.mounts ?? []).flatMap((m) => m.uses),
    ])];

    const gateway_guards: readonly Guard[] = definition.guards ?? [];

    const command_entries = new Map<string, CommandEntry>();
    const interaction_entries: InteractionEntry[] = [];
    const events_by_type = new Map<string, EventDefinition[]>();

    for(const mount of definition.mounts ?? []) {
        const mount_guards: readonly Guard[] = mount.guards ?? [];

        for(const cmd of mount.commands ?? []) {
            command_entries.set(cmd.data.name, {
                definition: cmd,
                guards: [...gateway_guards, ...mount_guards, ...(cmd.guards ?? [])],
                rate_limiter: cmd.rate_limit != null
                    ? createRateLimiter(cmd.rate_limit.limit, cmd.rate_limit.window_ms)
                    : null,
                autocomplete_rate_limiter: cmd.rate_limit != null && cmd.autocomplete != null
                    ? createRateLimiter(cmd.rate_limit.limit, cmd.rate_limit.window_ms)
                    : null,
                rate_limit_key: cmd.rate_limit?.key ?? perUser,
                concurrency_limiter: cmd.concurrency != null
                    ? createConcurrencyLimiter(cmd.concurrency.max)
                    : null,
                concurrency_key: cmd.concurrency?.key ?? perUser,
            });
        }

        for(const def of mount.interactions ?? []) {
            interaction_entries.push({
                definition: def,
                compiled: compilePattern(def.pattern),
                guards: [...gateway_guards, ...mount_guards, ...(def.guards ?? [])],
                rate_limiter: def.rate_limit != null
                    ? createRateLimiter(def.rate_limit.limit, def.rate_limit.window_ms)
                    : null,
                rate_limit_key: def.rate_limit?.key ?? perUser,
                concurrency_limiter: def.concurrency != null
                    ? createConcurrencyLimiter(def.concurrency.max)
                    : null,
                concurrency_key: def.concurrency?.key ?? perUser,
            });
        }

        for(const event_def of mount.events ?? []) {
            const type = event_def.type as string;
            const existing = events_by_type.get(type);
            if(existing != null) {
                existing.push(event_def);
            } else {
                events_by_type.set(type, [event_def]);
            }
        }
    }

    return defineComponent({
        calls: gateway_calls,
        uses: all_uses,
        config: DiscordGatewayConfig,
        secrets: DiscordGatewaySecrets,
        handlers: {},

        async start(context) {
            const client = definition.client;
            const rest = new REST({version: "10"}).setToken(context.secrets.token);

            const command_data = [...command_entries.values()].map((e) => e.definition.data.toJSON());
            const route = context.config.guild_id != null
                ? Routes.applicationGuildCommands(context.config.application_id, context.config.guild_id)
                : Routes.applicationCommands(context.config.application_id);
            await rest.put(route, {body: command_data});
            context.log.info(`Registered ${command_data.length} command(s).`);

            client.on(Events.InteractionCreate, async (interaction) => {
                try {
                    if(interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
                        await dispatchCommand(interaction.commandName, interaction);
                    } else if(interaction.isAutocomplete()) {
                        await dispatchAutocomplete(interaction);
                    } else if(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
                        await dispatchComponentInteraction(interaction);
                    }
                } catch (error) {
                    if(error instanceof UserFacingError && !interaction.isAutocomplete()) {
                        await replyUserError(interaction as RepliableInteraction, error.user_message);
                    } else if(!(error instanceof UserFacingError)) {
                        context.log.error("Unhandled error in interaction handler:", error);
                    }
                }
            });

            for(const [type, defs] of events_by_type) {
                client.on(type, async (...args: unknown[]) => {
                    const results = await Promise.allSettled(defs.map(async (event_def) => {
                        const handler_args = event_def.fetch_partials
                            ? await resolvePartials(args)
                            : args;
                        await event_def.handle({
                            event: handler_args as never,
                            client,
                            call: (ref, input) => context.call(ref, input),
                        });
                    }));
                    for(const result of results) {
                        if(result.status === "rejected") {
                            context.log.error(`Unhandled error in event handler (${type}):`, result.reason);
                        }
                    }
                });
            }

            await client.login(context.secrets.token);
            context.log.info("Discord client logged in.");

            async function dispatchCommand(
                name: string,
                interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
            ): Promise<void> {
                const entry = command_entries.get(name);
                if(entry == null) return;
                const {definition: cmd} = entry;

                await runGuards(entry.guards, {interaction, client});

                if(entry.rate_limiter != null) {
                    const key = entry.rate_limit_key(interaction);
                    if(!entry.rate_limiter.check(key)) {
                        await replyUserError(interaction, RATE_LIMIT_MESSAGE);
                        return;
                    }
                }

                let release: (() => void) | null = null;
                try {
                    if(entry.concurrency_limiter != null) {
                        const key = entry.concurrency_key(interaction);
                        release = await entry.concurrency_limiter.acquire(key);
                    }

                    let validated_options: unknown = null;
                    if(cmd.options != null && interaction.isChatInputCommand()) {
                        validated_options = (cmd.options as ComponentCallSchema).assert(
                            extractCommandOptions(interaction),
                        );
                    }

                    await cmd.handle({
                        interaction: interaction as never,
                        options: validated_options as never,
                        client,
                        call: (ref, input) => context.call(ref, input),
                    });
                } finally {
                    if(release != null) release();
                }
            }

            async function dispatchAutocomplete(
                interaction: AutocompleteInteraction,
            ): Promise<void> {
                const entry = command_entries.get(interaction.commandName);
                if(entry?.definition.autocomplete == null) return;
                const cmd = entry.definition;

                try {
                    await runGuards(entry.guards, {interaction, client});
                } catch (error) {
                    if(error instanceof UserFacingError) {
                        await interaction.respond([]);
                        return;
                    }
                    throw error;
                }

                if(entry.autocomplete_rate_limiter != null) {
                    const key = entry.rate_limit_key(interaction);
                    if(!entry.autocomplete_rate_limiter.check(key)) {
                        await interaction.respond([]);
                        return;
                    }
                }

                if(typeof cmd.autocomplete === "function") {
                    await cmd.autocomplete({
                        interaction,
                        call: (ref, input) => context.call(ref, input),
                    });
                    return;
                }

                const focused = interaction.options.getFocused(true);
                const sub = interaction.options.getSubcommand(false);
                const qualified_key = sub != null ? `${sub}/${focused.name}` : null;

                const map = cmd.autocomplete as AutocompleteMap<readonly AnyComponentCalls[]>;
                const handler = (qualified_key != null ? map[qualified_key] : null) ?? map[focused.name];
                if(handler == null) return;

                const result = await handler({
                    value: focused.value,
                    interaction,
                    call: (ref, input) => context.call(ref, input),
                });
                await interaction.respond(normalizeAutocompleteResult(result));
            }

            async function dispatchComponentInteraction(
                interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
            ): Promise<void> {
                for(const entry of interaction_entries) {
                    const params = matchPattern(entry.compiled, interaction.customId);
                    if(params == null) continue;

                    await runGuards(entry.guards, {interaction, client});

                    if(entry.rate_limiter != null) {
                        const key = entry.rate_limit_key(interaction);
                        if(!entry.rate_limiter.check(key)) {
                            await replyUserError(interaction, RATE_LIMIT_MESSAGE);
                            return;
                        }
                    }

                    let release: (() => void) | null = null;
                    try {
                        if(entry.concurrency_limiter != null) {
                            const key = entry.concurrency_key(interaction);
                            release = await entry.concurrency_limiter.acquire(key);
                        }

                        await entry.definition.handle({
                            interaction,
                            params: params as never,
                            client,
                            call: (ref, input) => context.call(ref, input),
                        });
                    } finally {
                        if(release != null) release();
                    }
                    return;
                }
            }
        },

        async stop(context) {
            definition.client.removeAllListeners();
            definition.client.destroy();
            context.log.info("Discord client destroyed.");
        },
    });
}
