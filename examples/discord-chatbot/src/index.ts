import {createApplication, defineApplication} from "@jiminp/peranto";

import {DiscordGateway} from "./gateway.ts";
import {QuotesComponent} from "./quotes.ts";
import {UsersComponent} from "./users.ts";

const QuoteBoardApp = defineApplication({
    components: [
        UsersComponent,
        QuotesComponent,
        DiscordGateway,
    ],
});

const app = createApplication(QuoteBoardApp, {base_dir: "app"});
await app.start();
