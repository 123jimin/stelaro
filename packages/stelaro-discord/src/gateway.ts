import {
    type AnyComponentCalls,
    type ComponentCallSchema,
    type ComponentId,
    defineComponent,
    defineComponentCalls,
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
    compilePattern,
    type InteractionDefinition,
    matchPattern,
} from "./interaction.ts";
import type {DiscordMountGroup} from "./mount.ts";

const DiscordGatewayConfig = schema({
    "application_id": "string",
    "guild_id?": "string",
});

const DiscordGatewaySecrets = schema({
    token: "string",
});

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
};

/**
 * Creates a stelaro component from a Discord gateway definition.
 *
 * Registers all commands with the Discord API on start, wires up event and
 * interaction dispatch, and logs in the client.
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

    const all_commands: CommandDefinition[] = (definition.mounts ?? []).flatMap((m) => m.commands ?? []);
    const all_events: EventDefinition[] = (definition.mounts ?? []).flatMap((m) => m.events ?? []);
    const all_interactions: InteractionDefinition[] = (definition.mounts ?? []).flatMap((m) => m.interactions ?? []);

    const compiled_interactions = all_interactions.map((def) => ({
        definition: def,
        compiled: compilePattern(def.pattern),
    }));

    const command_map = new Map<string, CommandDefinition>();
    for(const cmd of all_commands) {
        command_map.set(cmd.data.name, cmd);
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

            const command_data = all_commands.map((cmd) => cmd.data.toJSON());
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
                        await dispatchInteraction(interaction);
                    }
                } catch (error) {
                    context.log.error("Unhandled error in interaction handler:", error);
                }
            });

            for(const event_def of all_events) {
                client.on(event_def.type, async (...args: unknown[]) => {
                    try {
                        await event_def.handle({
                            event: args as never,
                            client,
                            call: (ref, input) => context.call(ref, input),
                        });
                    } catch (error) {
                        context.log.error(`Unhandled error in event handler (${event_def.type}):`, error);
                    }
                });
            }

            await client.login(context.secrets.token);
            context.log.info("Discord client logged in.");

            async function dispatchCommand(
                name: string,
                interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
            ): Promise<void> {
                const cmd = command_map.get(name);
                if(cmd == null) return;

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
            }

            async function dispatchAutocomplete(
                interaction: AutocompleteInteraction,
            ): Promise<void> {
                const cmd = command_map.get(interaction.commandName);
                if(cmd?.autocomplete == null) return;

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

            async function dispatchInteraction(
                interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
            ): Promise<void> {
                for(const {definition, compiled} of compiled_interactions) {
                    const params = matchPattern(compiled, interaction.customId);
                    if(params != null) {
                        await definition.handle({
                            interaction,
                            params: params as never,
                            client,
                            call: (ref, input) => context.call(ref, input),
                        });
                        return;
                    }
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
