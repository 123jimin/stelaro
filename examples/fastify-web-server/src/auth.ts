import fastifyPassport from "@fastify/passport";
import fastifySecureSession from "@fastify/secure-session";
import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {Strategy as DiscordStrategy} from "passport-discord";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";

export type SessionUser = {
    provider: "google" | "discord" | "id";
    provider_account_id: string;
    display_name: string;
};

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

export const authenticateGoogle = fastifyPassport.authenticate("google", {
    scope: ["profile", "email"],
});

export const authenticateGoogleCallback = fastifyPassport.authenticate("google", {
    failureRedirect: "/login",
});

export const authenticateDiscord = fastifyPassport.authenticate("discord");

export const authenticateDiscordCallback = fastifyPassport.authenticate("discord", {
    failureRedirect: "/login",
});

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if(request.user == null) {
        reply.redirect("/login");
    }
}
