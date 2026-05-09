import {Authenticator} from "@fastify/passport";
import fastifySecureSession from "@fastify/secure-session";
import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {Strategy as DiscordStrategy} from "passport-discord";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";

const fastifyPassport = new Authenticator();

export type SessionUser = {
    provider: "google" | "discord" | "id";
    provider_account_id: string;
    display_name: string;
};

declare module "fastify" {
    interface PassportUser extends SessionUser {}
}

export async function registerAuth(server: FastifyInstance): Promise<void> {
    await server.register(fastifySecureSession, {
        key: Buffer.alloc(32),
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
            clientID: "mock-google-client-id",
            clientSecret: "mock-google-client-secret",
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
            clientID: "mock-discord-client-id",
            clientSecret: "mock-discord-client-secret",
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
