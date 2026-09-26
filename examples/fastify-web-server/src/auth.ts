import {randomBytes} from "node:crypto";

import {Authenticator} from "@fastify/passport";
import fastifySecureSession from "@fastify/secure-session";
import {defineFastifyRoute, defineFastifyRoutes} from "@jiminp/stelaro-fastify";
import {type as schema} from "arktype";
import {DiscordScope, Strategy as DiscordStrategy} from "discord-strategy";
import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";

import {UsersCalls} from "./users.ts";

const fastifyPassport = new Authenticator();

export type SessionUser = {
    provider: "google" | "discord" | "id";
    provider_account_id: string;
    display_name: string;
};

declare module "fastify" {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module augmentation
    interface PassportUser extends SessionUser {}
}

export const AuthSecrets = schema({
    google_client_id: "string",
    google_client_secret: "string",
    discord_client_id: "string",
    discord_client_secret: "string",
});

export type AuthSecrets = typeof AuthSecrets.infer;

/**
 * Registers session and passport plugins on `server`.
 * OAuth strategies read `getSecrets()` once the server is ready, after the application has loaded its secrets.
 */
export async function registerAuth(server: FastifyInstance, getSecrets: () => AuthSecrets): Promise<void> {
    // A per-process key invalidates every session cookie on restart.
    await server.register(fastifySecureSession, {
        key: randomBytes(32),
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

    server.addHook("onReady", async () => {
        const secrets = getSecrets();
        // `app.secrets` is loaded by `app.start()`, which triggers `onReady` via the gateway's `listen`.
        if(secrets == null) throw new Error("Auth secrets are not loaded; start the application first.");

        fastifyPassport.use("google", new GoogleStrategy(
            {
                clientID: secrets.google_client_id,
                clientSecret: secrets.google_client_secret,
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
                clientID: secrets.discord_client_id,
                clientSecret: secrets.discord_client_secret,
                callbackURL: "/login/discord/callback",
                scope: [DiscordScope.Identify],
                // discord-strategy defaults these at runtime, but its option type inherits
                // them as required from passport-oauth2's StrategyOptions.
                authorizationURL: "https://discord.com/api/oauth2/authorize",
                tokenURL: "https://discord.com/api/oauth2/token",
            },
            (_access_token, _refresh_token, profile, done) => {
                done(null, {
                    provider: "discord",
                    provider_account_id: profile.id,
                    display_name: profile.username,
                } satisfies SessionUser);
            },
        ));
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
                        <p>OAuth login needs real client credentials in <code>app/secrets.toml</code>.</p>
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
            async handle({request, call, redirect}) {
                if(request.user != null) await call(UsersCalls.calls.resolve, request.user);
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
            async handle({request, call, redirect}) {
                if(request.user != null) await call(UsersCalls.calls.resolve, request.user);
                return redirect("/");
            },
        },
        defineFastifyRoute({
            method: "POST",
            path: "/login/id",
            body: schema({name: "string"}),
            async handle({request, body: form, call, redirect}) {
                const user: SessionUser = {provider: "id", provider_account_id: form.name, display_name: form.name};
                await call(UsersCalls.calls.resolve, user);
                await request.login(user);
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
