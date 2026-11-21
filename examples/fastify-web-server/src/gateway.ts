import {defineFastifyGateway} from "@jiminp/stelaro-fastify";
import type {
    FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault,
} from "fastify";

import type {PassportAuthenticator} from "./auth.ts";
import {createAuthRoutes} from "./auth.ts";
import {comment_routes} from "./comments.ts";
import {WebConfig} from "./config.ts";
import {thread_routes} from "./threads/index.ts";

/** Thin Fastify gateway composing the component-owned route groups. */
export function createWebGateway<TLogger extends FastifyBaseLogger = FastifyBaseLogger>(
    server: FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, TLogger>,
    passport: PassportAuthenticator,
) {
    return defineFastifyGateway({
        id: "web",
        server,
        uses: [],
        config: WebConfig,
        mounts: [
            thread_routes,
            comment_routes,
            createAuthRoutes(passport),
        ],
    });
}
