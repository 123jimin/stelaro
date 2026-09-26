import {createApplication, defineApplication, parseArgs} from "@jiminp/stelaro";

import {DiscordGateway} from "./gateway.ts";
import {QuotesComponent} from "./quotes/index.ts";
import {UsersComponent} from "./users.ts";

const QuoteBoardApp = defineApplication({
    components: [
        UsersComponent,
        QuotesComponent,
        DiscordGateway,
    ],
});

const app = createApplication(QuoteBoardApp, parseArgs());
await app.start();
