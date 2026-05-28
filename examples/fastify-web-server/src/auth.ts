import {Authenticator} from "@fastify/passport";
import fastifySecureSession from "@fastify/secure-session";
import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {defineFastifyRoutes, route} from "@jiminp/stelaro-fastify";
import {type as schema} from "arktype";
import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {Strategy as DiscordStrategy} from "passport-discord";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";

import {UsersCalls} from "./users.ts";

const fastifyPassport = new Authenticator();

export type SessionUser = {
    provider: "google" | "discord" | "id";
    provider_account_id: string;
    display_name: string;
};

declare module "fastify" {
    interface PassportUser extends SessionUser {}
}

const AuthCalls = defineComponentCalls("auth", {});

const AuthSecrets = schema({
    google_client_id: "string",
    google_client_secret: "string",
    discord_client_id: "string",
    discord_client_secret: "string",
    session_key: "string",
});

export function createAuthComponent(server: FastifyInstance) {
    return defineComponent({
        calls: AuthCalls,
        uses: [],
        secrets: AuthSecrets,
        handlers: {},

        async start(context) {
            await server.register(fastifySecureSession, {
                key: Buffer.from(context.secrets.session_key, "hex"),
                cookie: {path: "/"},
            });

            await server.register(fastifyPassport.initialize());
            await server.register(fastifyPassport.secureSession());

            fastifyPassport.registerUserSerializer<SessionUser, SessionUser>(
                async (user) => user,
            );
            fastifyPassport.registerUserDeserializer<SessionUser, SessionUser>(
                async (user) => user,
            );

            fastifyPassport.use("google", new GoogleStrategy(
                {
                    clientID: context.secrets.google_client_id,
                    clientSecret: context.secrets.google_client_secret,
                    callbackURL: "/login/google/callback",
                },
                (_access_token, _refresh_token, profile, done) => {
                    done(null, {
                        provider: "google",
                        provider_account_id: profile.id,
                        display_name: profile.displayName,
                    } satisfies SessionUser);
                },
            ));

            fastifyPassport.use("discord", new DiscordStrategy(
                {
                    clientID: context.secrets.discord_client_id,
                    clientSecret: context.secrets.discord_client_secret,
                    callbackURL: "/login/discord/callback",
                    scope: ["identify"],
                },
                (_access_token, _refresh_token, profile, done) => {
                    done(null, {
                        provider: "discord",
                        provider_account_id: profile.id,
                        display_name: profile.username,
                    } satisfies SessionUser);
                },
            ));
        },
    });
}

const _authenticateGoogle = fastifyPassport.authenticate("google", {scope: ["profile", "email"]});
const _authenticateGoogleCallback = fastifyPassport.authenticate("google", {failureRedirect: "/login"});
const _authenticateDiscord = fastifyPassport.authenticate("discord");
const _authenticateDiscordCallback = fastifyPassport.authenticate("discord", {failureRedirect: "/login"});

export async function authenticateGoogle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await _authenticateGoogle.call(request.server, request, reply);
}

export async function authenticateGoogleCallback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await _authenticateGoogleCallback.call(request.server, request, reply);
}

export async function authenticateDiscord(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await _authenticateDiscord.call(request.server, request, reply);
}

export async function authenticateDiscordCallback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await _authenticateDiscordCallback.call(request.server, request, reply);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if(request.user == null) {
        reply.redirect("/login");
    }
}

export const AuthRoutes = defineFastifyRoutes({
    uses: [UsersCalls],
    routes: [
        {
            method: "GET",
            path: "/login",
            async handle({html}) {
                return html(`
                    <h1>Login</h1>
                    <section>
                        <nav>
                            <ul>
                                <li><a href="/login/google">Login with Google</a></li>
                                <li><a href="/login/discord">Login with Discord</a></li>
                            </ul>
                        </nav>
                    </section>
                    <section>
                        <h2>Login with ID</h2>
                        <form method="post" action="/login/id">
                            <label>Name<br><input type="text" name="name" required></label>
                            <button type="submit">Login</button>
                        </form>
                    </section>
                    <nav><a href="/">Back</a></nav>
                `);
            },
        },
        {
            method: "GET",
            path: "/login/google",
            preValidation: [authenticateGoogle],
            async handle() {},
        },
        {
            method: "GET",
            path: "/login/google/callback",
            preValidation: [authenticateGoogleCallback],
            async handle({redirect}) {
                return redirect("/");
            },
        },
        {
            method: "GET",
            path: "/login/discord",
            preValidation: [authenticateDiscord],
            async handle() {},
        },
        {
            method: "GET",
            path: "/login/discord/callback",
            preValidation: [authenticateDiscordCallback],
            async handle({redirect}) {
                return redirect("/");
            },
        },
        route({
            method: "POST",
            path: "/login/id",
            body: schema({name: "string"}),
            async handle({request, body: form, call, redirect}) {
                await request.login({
                    provider: "id",
                    provider_account_id: form.name,
                    display_name: form.name,
                });
                await call(UsersCalls.calls.resolve, {
                    provider: "id",
                    provider_account_id: form.name,
                    display_name: form.name,
                });
                return redirect("/");
            },
        }),
        {
            method: "POST",
            path: "/logout",
            async handle({request, redirect}) {
                await request.logout();
                return redirect("/");
            },
        },
    ],
});
