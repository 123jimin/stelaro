import type {ApplicationOptions, ComponentCallFn} from "@jiminp/stelaro";
import {createApplication, defineApplication} from "@jiminp/stelaro";
import type {PinoLoggerFactory} from "@jiminp/stelaro-pino";
import {definePinoLogger} from "@jiminp/stelaro-pino";
import fastify from "fastify";
import pino from "pino";

import {configureAuthentication} from "./auth.ts";
import {comments_component} from "./comments.ts";
import {createWebGateway} from "./gateway.ts";
import {threads_component} from "./threads/index.ts";
import {user_calls, users_component} from "./users.ts";

export type BbsApplicationOptions = {
    readonly application_options?: ApplicationOptions;
    readonly logger?: PinoLoggerFactory;
};

/**
 * Assemble the BBS application with Pino logging, external Fastify auth/session
 * setup, domain components, and the thin Fastify gateway.
 */
export function createBbsApplication(options: BbsApplicationOptions = {}) {
    const logger = options.logger ?? definePinoLogger(pino({level: "info"}));
    const server = fastify({
        loggerInstance: logger.childPinoLogger("web"),
    });

    let dispatchUserCall: ComponentCallFn<readonly [typeof user_calls]> | null = null;
    const requireUserCall = () => {
        if(dispatchUserCall == null) {
            throw new Error("Application is not initialized.");
        }
        return dispatchUserCall;
    };

    const passport = configureAuthentication(server, {
        resolveUser: (input) => requireUserCall()(user_calls.calls.resolveUser, input),
        getUser: (user_id) => requireUserCall()(user_calls.calls.getUser, {user_id}),
    });

    const web_gateway = createWebGateway(server, passport);
    const app = createApplication(
        defineApplication({
            components: [users_component, threads_component, comments_component, web_gateway],
            logger,
        }),
        {validate_call_input: true, ...options.application_options},
    );
    dispatchUserCall = app.call;

    return {app, server, passport};
}
