import {deepEqual, equal, notEqual, rejects} from "node:assert/strict";
import {appendFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";

import {CallInputError} from "@jiminp/stelaro";

import {createTemporaryDirectory, readRawJsonlLines, startDomainApplication} from "./test-util.ts";
import {user_calls} from "./users.ts";

test("users resolves provider identities, creates on first sight, and persists exact JSONL fields", async (t) => {
    const data_dir = await createTemporaryDirectory(t);
    const {app, stop} = await startDomainApplication(t, data_dir);

    const google_user = await app.call(user_calls.calls.resolveUser, {
        provider: "google",
        provider_account_id: "acct-1",
        display_name: "Alice Google",
    });
    const same_google_user = await app.call(user_calls.calls.resolveUser, {
        provider: "google",
        provider_account_id: "acct-1",
        display_name: "Different Name Ignored",
    });
    deepEqual(same_google_user, google_user);

    // Same account ID under a different provider resolves to a distinct user.
    const discord_user = await app.call(user_calls.calls.resolveUser, {
        provider: "discord",
        provider_account_id: "acct-1",
        display_name: "Alice Discord",
    });
    notEqual(discord_user.user_id, google_user.user_id);

    // Concurrent first-sight ID-login calls for the same name produce a single user record.
    const [id_first, id_second] = await Promise.all([
        app.call(user_calls.calls.resolveUser, {provider: "id", provider_account_id: "alice", display_name: "alice"}),
        app.call(user_calls.calls.resolveUser, {provider: "id", provider_account_id: "alice", display_name: "alice"}),
    ]);
    deepEqual(id_first, id_second);
    notEqual(id_first.user_id, google_user.user_id);

    const users_file = join(data_dir, "users", "users.jsonl");
    const lines = await readRawJsonlLines(users_file);
    equal(lines.length, 3);
    for(const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        deepEqual(Object.keys(parsed).sort(), ["created_at", "display_name", "provider", "provider_account_id", "user_id"]);
    }

    // Reject unknown providers and blank values.
    await rejects(
        () => app.call(user_calls.calls.resolveUser, {
            provider: "github" as never,
            provider_account_id: "acct-1",
            display_name: "Bad",
        }),
        CallInputError,
    );
    await rejects(
        () => app.call(user_calls.calls.resolveUser, {
            provider: "id",
            provider_account_id: "   ",
            display_name: "Blank",
        }),
        CallInputError,
    );

    // Persist across application restarts.
    await stop();
    const restarted = await startDomainApplication(t, data_dir);
    deepEqual(await restarted.app.call(user_calls.calls.getUser, {user_id: id_first.user_id}), id_first);
    deepEqual(
        await restarted.app.call(user_calls.calls.resolveUser, {provider: "id", provider_account_id: "alice", display_name: "alice"}),
        id_first,
    );
    equal(await restarted.app.call(user_calls.calls.getUser, {user_id: "missing"}), null);
});

test("users reads uncached records from disk and preserves existing lines on append", async (t) => {
    const data_dir = await createTemporaryDirectory(t);
    const {app} = await startDomainApplication(t, data_dir);

    const initial = await app.call(user_calls.calls.resolveUser, {
        provider: "id",
        provider_account_id: "first",
        display_name: "first",
    });
    const users_file = join(data_dir, "users", "users.jsonl");
    const before_lines = await readRawJsonlLines(users_file);
    equal(before_lines.length, 1);

    const external_user = {
        user_id: "external-user-1",
        provider: "google",
        provider_account_id: "ext-42",
        display_name: "External",
        created_at: "2026-01-01T00:00:00.000Z",
    };
    await appendFile(users_file, `${JSON.stringify(external_user)}\n`, "utf8");

    // Visible immediately without restarting the app.
    deepEqual(await app.call(user_calls.calls.getUser, {user_id: "external-user-1"}), external_user);
    deepEqual(
        await app.call(user_calls.calls.resolveUser, {provider: "google", provider_account_id: "ext-42", display_name: "Ignored"}),
        external_user,
    );

    await app.call(user_calls.calls.resolveUser, {provider: "discord", provider_account_id: "d-2", display_name: "Second"});
    const after_lines = await readRawJsonlLines(users_file);
    equal(after_lines.length, 3);
    equal(after_lines[0], before_lines[0]);
    deepEqual(JSON.parse(after_lines[0]!), initial);
    equal(after_lines[1], JSON.stringify(external_user));
});
