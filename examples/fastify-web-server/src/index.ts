import fastifyFormbody from "@fastify/formbody";
import {createApplication, defineApplication, parseArgs} from "@jiminp/stelaro";
import Fastify from "fastify";

import {AuthComponent, registerAuth} from "./auth.ts";
import {CommentsComponent} from "./comments.ts";
import {createGateway} from "./gateway.ts";
import {ThreadsComponent} from "./threads.ts";
import {UsersComponent} from "./users.ts";

// eslint-disable-next-line new-cap -- Fastify's public API
const server = Fastify();

const BbsApp = defineApplication({
    components: [
        UsersComponent,
        ThreadsComponent,
        CommentsComponent,
        AuthComponent,
        createGateway(server),
    ],
});

const app = createApplication(BbsApp, parseArgs());

await server.register(fastifyFormbody);
await registerAuth(server);
await app.start();
