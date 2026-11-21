import {deepEqual, equal, match, ok} from "node:assert/strict";
import {join} from "node:path";
import {test} from "node:test";

import {MOCK_DISCORD_OAUTH, MOCK_GOOGLE_OAUTH} from "./auth.ts";
import {createTemporaryDirectory, extractCookieHeader, readRawJsonlLines, startBbsApplication} from "./test-util.ts";
import type {ThreadRecord} from "./threads/index.ts";
import type {UserRecord} from "./users.ts";

type OAuth2Internal = {
    _oauth2: {
        getOAuthAccessToken: (
            code: string,
            params: unknown,
            callback: (error: Error | null, access_token?: string, refresh_token?: string, results?: object) => void,
        ) => void;
    };
    userProfile?: (access_token: string, done: (error: Error | null, profile?: unknown) => void) => void;
    resolveApi?: (endpoint: string, access_token: string) => Promise<unknown>;
};

test("login page lists methods, secretless ID login maps equal names to one user, and logout ends the session", async (t) => {
    const base_dir = await createTemporaryDirectory(t);
    const {base_url, data_dir} = await startBbsApplication(t, base_dir);

    const login_page = await fetch(`${base_url}/login`);
    equal(login_page.status, 200);
    const login_html = await login_page.text();
    match(login_html, /href="\/login\/google"/u);
    match(login_html, /href="\/login\/discord"/u);
    match(login_html, /action="\/login\/id"/u);
    ok(!login_html.includes('type="password"'));

    // First ID login creates a user without any password or secret.
    const first_login = await fetch(`${base_url}/login/id`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({name: "alice"}).toString(),
        redirect: "manual",
    });
    equal(first_login.status, 303);
    equal(first_login.headers.get("location"), "/");
    const cookie_one = extractCookieHeader(first_login);
    ok(cookie_one.length > 0);

    const created_one = await fetch(`${base_url}/threads`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cookie": cookie_one,
        },
        body: new URLSearchParams({title: "First", body: "By alice 1"}).toString(),
        redirect: "manual",
    });
    equal(created_one.status, 303);

    // Logout ends the session so the previous cookie can no longer access protected actions.
    const logout_response = await fetch(`${base_url}/logout`, {
        method: "POST",
        headers: {cookie: cookie_one},
        redirect: "manual",
    });
    equal(logout_response.status, 303);
    equal(logout_response.headers.get("location"), "/");
    const post_logout_cookie = extractCookieHeader(logout_response) || cookie_one;

    const after_logout_form = await fetch(`${base_url}/threads/new`, {
        headers: {cookie: post_logout_cookie},
        redirect: "manual",
    });
    equal(after_logout_form.status, 302);
    equal(after_logout_form.headers.get("location"), "/login");

    const after_logout_old_cookie = await fetch(`${base_url}/threads`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cookie": cookie_one,
        },
        body: new URLSearchParams({title: "Blocked", body: "Old session"}).toString(),
        redirect: "manual",
    });
    equal(after_logout_old_cookie.status, 401);

    // Logging in again with the same name resolves to the exact same user record.
    const second_login = await fetch(`${base_url}/login/id`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({name: "alice"}).toString(),
        redirect: "manual",
    });
    equal(second_login.status, 303);
    const cookie_two = extractCookieHeader(second_login);

    const created_two = await fetch(`${base_url}/threads`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cookie": cookie_two,
        },
        body: new URLSearchParams({title: "Second", body: "By alice 2"}).toString(),
        redirect: "manual",
    });
    equal(created_two.status, 303);

    const user_lines = await readRawJsonlLines(join(data_dir, "users", "users.jsonl"));
    equal(user_lines.length, 1);
    const user = JSON.parse(user_lines[0]!) as UserRecord;
    equal(user.provider, "id");
    equal(user.provider_account_id, "alice");
    equal(user.display_name, "alice");

    const thread_lines = await readRawJsonlLines(join(data_dir, "threads", "threads.jsonl"));
    equal(thread_lines.length, 2);
    const threads = thread_lines.map((line) => JSON.parse(line) as ThreadRecord);
    deepEqual(threads.map((thread) => thread.author_user_id), [user.user_id, user.user_id]);
});

test("Google and Discord OAuth entry and callback routes work with mock credentials and mocks", async (t) => {
    const base_dir = await createTemporaryDirectory(t);
    const {base_url, data_dir, passport} = await startBbsApplication(t, base_dir);

    // Entry routes redirect to provider authorization endpoints using mock credentials.
    const google_entry = await fetch(`${base_url}/login/google`, {redirect: "manual"});
    equal(google_entry.status, 302);
    const google_redirect = new URL(google_entry.headers.get("location")!);
    equal(google_redirect.origin, "https://accounts.google.com");
    equal(google_redirect.searchParams.get("client_id"), MOCK_GOOGLE_OAUTH.client_id);
    match(google_redirect.searchParams.get("redirect_uri")!, /\/login\/google\/callback$/u);

    const discord_entry = await fetch(`${base_url}/login/discord`, {redirect: "manual"});
    equal(discord_entry.status, 302);
    const discord_redirect = new URL(discord_entry.headers.get("location")!);
    equal(discord_redirect.origin, "https://discord.com");
    equal(discord_redirect.searchParams.get("client_id"), MOCK_DISCORD_OAUTH.client_id);
    match(discord_redirect.searchParams.get("redirect_uri")!, /\/login\/discord\/callback$/u);

    // Stub OAuth token exchange and profile fetches on the registered strategies to test callback wiring offline.
    const google_strategy = passport.strategy("google") as unknown as OAuth2Internal;
    google_strategy._oauth2.getOAuthAccessToken = (_code, _params, callback) => {
        callback(null, "mock-google-access-token", "mock-google-refresh-token", {});
    };
    google_strategy.userProfile = (_token, done) => {
        done(null, {id: "g-123", displayName: "Grace Google", provider: "google"});
    };

    const discord_strategy = passport.strategy("discord") as unknown as OAuth2Internal;
    discord_strategy._oauth2.getOAuthAccessToken = (_code, _params, callback) => {
        callback(null, "mock-discord-access-token", "mock-discord-refresh-token", {});
    };
    discord_strategy.resolveApi = () => Promise.resolve({
        id: "d-456",
        username: "diana",
        discriminator: "0",
        global_name: "Diana Discord",
    });

    const google_callback = await fetch(`${base_url}/login/google/callback?code=mock-google-code`, {redirect: "manual"});
    equal(google_callback.status, 302);
    equal(google_callback.headers.get("location"), "/");
    const google_cookie = extractCookieHeader(google_callback);
    ok(google_cookie.length > 0);

    const google_home = await fetch(`${base_url}/`, {headers: {cookie: google_cookie}});
    equal(google_home.status, 200);
    match(await google_home.text(), /Signed in as Grace Google/u);

    const discord_callback = await fetch(`${base_url}/login/discord/callback?code=mock-discord-code`, {redirect: "manual"});
    equal(discord_callback.status, 302);
    equal(discord_callback.headers.get("location"), "/");
    const discord_cookie = extractCookieHeader(discord_callback);
    ok(discord_cookie.length > 0);

    const discord_home = await fetch(`${base_url}/`, {headers: {cookie: discord_cookie}});
    equal(discord_home.status, 200);
    match(await discord_home.text(), /Signed in as Diana Discord/u);

    const users = (await readRawJsonlLines(join(data_dir, "users", "users.jsonl")))
        .map((line) => JSON.parse(line) as UserRecord);
    equal(users.length, 2);
    deepEqual(users.map((user) => [user.provider, user.provider_account_id, user.display_name]), [
        ["google", "g-123", "Grace Google"],
        ["discord", "d-456", "Diana Discord"],
    ]);
});

test("in-memory sessions do not survive application restart while persisted records remain", async (t) => {
    const base_dir = await createTemporaryDirectory(t);
    const first_run = await startBbsApplication(t, base_dir);

    const login = await fetch(`${first_run.base_url}/login/id`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({name: "carol"}).toString(),
        redirect: "manual",
    });
    equal(login.status, 303);
    const old_cookie = extractCookieHeader(login);

    const create_thread = await fetch(`${first_run.base_url}/threads`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cookie": old_cookie,
        },
        body: new URLSearchParams({title: "Before restart", body: "Persisted body"}).toString(),
        redirect: "manual",
    });
    equal(create_thread.status, 303);

    await first_run.stop();

    const second_run = await startBbsApplication(t, base_dir);

    // Persisted thread is still listed after restart.
    const home = await fetch(`${second_run.base_url}/`, {headers: {cookie: old_cookie}});
    equal(home.status, 200);
    const home_html = await home.text();
    match(home_html, /Before restart/u);
    match(home_html, /href="\/login"/u);
    ok(!home_html.includes("Signed in as carol"));

    // Previous session cookie is no longer valid after restart.
    const blocked_new_form = await fetch(`${second_run.base_url}/threads/new`, {
        headers: {cookie: old_cookie},
        redirect: "manual",
    });
    equal(blocked_new_form.status, 302);
    equal(blocked_new_form.headers.get("location"), "/login");

    const blocked_post = await fetch(`${second_run.base_url}/threads`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cookie": old_cookie,
        },
        body: new URLSearchParams({title: "After restart", body: "Should fail"}).toString(),
        redirect: "manual",
    });
    equal(blocked_post.status, 401);
});
