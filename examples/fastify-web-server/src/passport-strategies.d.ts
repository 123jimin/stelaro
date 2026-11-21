declare module "passport-oauth2" {
    namespace OAuth2Strategy {
        export interface StrategyOptions {
            authorizationURL?: string;
            tokenURL?: string;
            clientID: string;
            clientSecret: string;
            callbackURL: string;
            scope?: string | string[];
        }
    }

    class OAuth2Strategy {
        name: string;
        constructor(options: OAuth2Strategy.StrategyOptions, verify: (...args: unknown[]) => void);
        authenticate(req: unknown, options?: unknown): void;
    }

    export default OAuth2Strategy;
}

declare module "passport-google-oauth20" {
    export interface GoogleProfile {
        readonly id: string;
        readonly displayName?: string;
        readonly username?: string;
        readonly provider: string;
    }

    export interface GoogleStrategyOptions {
        readonly clientID: string;
        readonly clientSecret: string;
        readonly callbackURL: string;
        readonly authorizationURL?: string;
        readonly tokenURL?: string;
        readonly userProfileURL?: string;
        readonly scope?: string | readonly string[];
    }

    export type VerifyCallback = (error?: Error | null | unknown, user?: Express.User | false, info?: object) => void;

    export type VerifyFunction = (
        access_token: string,
        refresh_token: string,
        profile: GoogleProfile,
        done: VerifyCallback,
    ) => void;

    export class Strategy {
        name: string;
        constructor(options: GoogleStrategyOptions, verify: VerifyFunction);
        authenticate(req: unknown, options?: unknown): void;
        userProfile(access_token: string, done: (error: Error | null, profile?: GoogleProfile) => void): void;
    }
}
