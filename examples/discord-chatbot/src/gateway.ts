import {defineDiscordGateway} from "@jiminp/peranto-discord";
import {Client, GatewayIntentBits} from "discord.js";

import {QuotesMounts} from "./quotes/index.ts";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
    ],
});

export const DiscordGateway = defineDiscordGateway({
    id: "discord",
    client,
    uses: [],
    mounts: [QuotesMounts],
});
