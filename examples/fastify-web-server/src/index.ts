import fastifyFormbody from "@fastify/formbody";
import {createApplication, defineApplication, parseArgs} from "@jiminp/stelaro";
import Fastify from "fastify";

import {AuthSecrets, registerAuth} from "./auth.ts";
import {CommentsComponent} from "./comments.ts";
import {createGateway} from "./gateway.ts";
import {ThreadsComponent} from "./threads.ts";
import {UsersComponent} from "./users.ts";

// eslint-disable-next-line new-cap -- Fastify's public API
const server = Fastify();

const BbsApp = defineApplication({
    secrets: AuthSecrets,
    components: [
        UsersComponent,
        ThreadsComponent,
        CommentsComponent,
        createGateway(server),
    ],
});

const app = createApplication(BbsApp, parseArgs());

await server.register(fastifyFormbody);
await registerAuth(server, () => app.secrets);
await app.start();
