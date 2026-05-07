import Fastify from "fastify";
import fastifyFormbody from "@fastify/formbody";
import {createApplication, defineApplication} from "@jiminp/peranto";

import {registerAuth} from "./auth.ts";
import {CommentsComponent} from "./comments.ts";
import {createGateway} from "./gateway.ts";
import {ThreadsComponent} from "./threads.ts";
import {UsersComponent} from "./users.ts";

const server = Fastify();
await server.register(fastifyFormbody);
await registerAuth(server);

const HttpGateway = createGateway(server);

const BbsApp = defineApplication({
    components: [
        UsersComponent,
        ThreadsComponent,
        CommentsComponent,
        HttpGateway,
    ],
});

const app = createApplication(BbsApp);
await app.start();
