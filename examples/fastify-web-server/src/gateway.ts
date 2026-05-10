import {defineFastifyGateway} from "@jiminp/peranto-fastify";
import type {FastifyInstance} from "fastify";

import {AuthRoutes} from "./auth.ts";
import {CommentsRoutes} from "./comments.ts";
import {ThreadsRoutes} from "./threads.ts";

export function createGateway(server: FastifyInstance) {
    return defineFastifyGateway({
        id: "http",
        server,
        uses: [],
        mounts: [ThreadsRoutes, CommentsRoutes, AuthRoutes],
    });
}
