import {randomBytes} from "node:crypto";

import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyPassport from "@fastify/passport";
import fastifySession from "@fastify/session";
import type {GatewayHandlerContext} from "@jiminp/stelaro-fastify";
import {defineFastifyRoute, defineFastifyRoutes, sendHtml} from "@jiminp/stelaro-fastify";
import {type} from "arktype";
import {DiscordScope, Strategy as DiscordStrategy} from "discord-strategy";
import type {
    FastifyBaseLogger, FastifyInstance, preValidationAsyncHookHandler, RawReplyDefaultExpression,
    RawRequestDefaultExpression, RawServerDefault,
} from "fastify";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";

import type {WebConfig} from "./config.ts";
import {renderPage} from "./html.ts";
import {TrimmedNonEmptyString} from "./storage.ts";
import type {AuthProvider, UserRecord} from "./users.ts";
import {user_calls} from "./users.ts";

declare module "fastify" {
    interface PassportUser {
        readonly user_id: UserRecord["user_id"];
        readonly provider: UserRecord["provider"];
        readonly provider_account_id: UserRecord["provider_account_id"];
        readonly display_name: UserRecord["display_name"];
        readonly created_at: UserRecord["created_at"];
    }
}

export type PassportAuthenticator = InstanceType<typeof fastifyPassport.Authenticator>;

export const MOCK_GOOGLE_OAUTH = {
    client_id: "mock-google-client-id",
    client_secret: "mock-google-client-secret",
    callback_url: "http://localhost/login/google/callback",
} as const;

export const MOCK_DISCORD_OAUTH = {
    client_id: "mock-discord-client-id",
    client_secret: "mock-discord-client-secret",
    callback_url: "http://localhost/login/discord/callback",
} as const;

export type AuthUserLookup = {
    resolveUser(input: {
        readonly provider: AuthProvider;
        readonly provider_account_id: string;
        readonly display_name: string;
    }): Promise<UserRecord>;
    getUser(user_id: string): Promise<UserRecord | null>;
};

/** Require an authenticated session before allowing protected routes to run. */
export const requireAuthenticated: preValidationAsyncHookHandler = async (request, reply) => {
    if(!request.isAuthenticated()) {
        if(request.method === "GET" || request.method === "HEAD") {
            await reply.redirect("/login");
        } else {
            await sendHtml(
                reply.code(401),
                `<p>Authentication required. <a href="/login">Log in</a>.</p>`,
            );
        }
    }
};

/**
 * Configure form parsing, in-memory sessions, and `@fastify/passport` strategies
 * outside the Fastify gateway definition.
 */
export function configureAuthentication<TLogger extends FastifyBaseLogger = FastifyBaseLogger>(
    server: FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, TLogger>,
    users: AuthUserLookup,
): PassportAuthenticator {
    const passport = new fastifyPassport.Authenticator();

    // Ephemeral per-process secret + default in-memory MemoryStore so sessions never survive restarts.
    server.register(fastifyFormbody);
    server.register(fastifyCookie);
    server.register(fastifySession, {
        secret: randomBytes(32).toString("hex"),
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: "auto",
        },
    });
    server.register(passport.initialize());
    server.register(passport.secureSession());

    passport.registerUserSerializer<UserRecord, string>((user) => Promise.resolve(user.user_id));
    passport.registerUserDeserializer<string, UserRecord | null>((user_id) => users.getUser(user_id));

    passport.use("google", new GoogleStrategy(
        {
            clientID: MOCK_GOOGLE_OAUTH.client_id,
            clientSecret: MOCK_GOOGLE_OAUTH.client_secret,
            callbackURL: MOCK_GOOGLE_OAUTH.callback_url,
        },
        (_access_token, _refresh_token, profile, done) => {
            const display_name = profile.displayName ?? profile.username ?? profile.id;
            users.resolveUser({
                provider: "google",
                provider_account_id: profile.id,
                display_name,
            }).then(
                (user) => done(null, user),
                (error) => done(error),
            );
        },
    ));

    passport.use("discord", new DiscordStrategy(
        {
            clientID: MOCK_DISCORD_OAUTH.client_id,
            clientSecret: MOCK_DISCORD_OAUTH.client_secret,
            callbackURL: MOCK_DISCORD_OAUTH.callback_url,
            scope: [DiscordScope.Identify],
        },
        (_access_token, _refresh_token, profile, verified) => {
            const display_name = profile.global_name ?? profile.username ?? profile.id;
            users.resolveUser({
                provider: "discord",
                provider_account_id: profile.id,
                display_name,
            }).then(
                (user) => verified(null, user),
                (error) => verified(error),
            );
        },
    ));

    return passport;
}

const IdLoginBody = type({name: TrimmedNonEmptyString});

export function createAuthRoutes(passport: PassportAuthenticator) {
    return defineFastifyRoutes({
        uses: [user_calls],
        routes: [
            {
                method: "GET",
                path: "/login",
                handle(context: GatewayHandlerContext<readonly [typeof user_calls], WebConfig>) {
                    const content = [
                        "<h1>Log in</h1>",
                        "<ul>",
                        `<li><a href="/login/google">Log in with Google (mock OAuth)</a></li>`,
                        `<li><a href="/login/discord">Log in with Discord (mock OAuth)</a></li>`,
                        "</ul>",
                        `<form method="post" action="/login/id">`,
                        `<label>Name <input type="text" name="name" required></label>`,
                        `<button type="submit">Log in with ID</button>`,
                        "</form>",
                    ].join("\n");
                    context.html(renderPage({
                        site_title: context.getConfig().site_title,
                        page_title: "Log in",
                        user: context.request.user ?? null,
                        content,
                    }));
                },
            },
            {
                method: "GET",
                path: "/login/google",
                preValidation: passport.authenticate("google", {scope: ["profile"]}),
                handle() {},
            },
            {
                method: "GET",
                path: "/login/google/callback",
                preValidation: passport.authenticate("google", {successRedirect: "/", failureRedirect: "/login"}),
                handle(context) {
                    context.redirect("/");
                },
            },
            {
                method: "GET",
                path: "/login/discord",
                preValidation: passport.authenticate("discord", {scope: [DiscordScope.Identify]}),
                handle() {},
            },
            {
                method: "GET",
                path: "/login/discord/callback",
                preValidation: passport.authenticate("discord", {successRedirect: "/", failureRedirect: "/login"}),
                handle(context) {
                    context.redirect("/");
                },
            },
            defineFastifyRoute({
                method: "POST",
                path: "/login/id",
                body: IdLoginBody,
                async handle(context) {
                    const user = await context.call(user_calls.calls.resolveUser, {
                        provider: "id",
                        provider_account_id: context.body.name,
                        display_name: context.body.name,
                    });
                    await context.request.logIn(user);
                    context.redirect("/");
                },
            }),
            {
                method: "POST",
                path: "/logout",
                async handle(context) {
                    await context.request.logOut();
                    context.redirect("/");
                },
            },
        ],
    });
}
