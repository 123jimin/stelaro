import {deepEqual, equal, rejects} from "node:assert/strict";
import {appendFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";

import {CallInputError, UserFacingError} from "@jiminp/stelaro";

import {createTemporaryDirectory, readRawJsonlLines, startDomainApplication} from "../test-util.ts";
import {user_calls} from "../users.ts";
import {thread_calls} from "./index.ts";

test("threads creates immutable threads, lists newest-first without pagination, and persists across restarts", async (t) => {
    const data_dir = await createTemporaryDirectory(t);
    const {app, stop} = await startDomainApplication(t, data_dir);

    // Immutability: only create, list, and get exist on the thread call surface.
    deepEqual(Object.keys(thread_calls.calls).sort(), ["createThread", "getThread", "listThreads"]);

    deepEqual(await app.call(thread_calls.calls.listThreads, {}), []);
    equal(await app.call(thread_calls.calls.getThread, {thread_id: "missing"}), null);

    await rejects(
        () => app.call(thread_calls.calls.createThread, {author_user_id: "unknown-user", title: "Hello", body: "World"}),
        UserFacingError,
    );

    const author = await app.call(user_calls.calls.resolveUser, {
        provider: "id",
        provider_account_id: "alice",
        display_name: "alice",
    });

    const first = await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "First thread",
        body: "First body",
    });
    const second = await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "Second thread",
        body: "Second body",
    });
    const third = await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "Third thread",
        body: "Third body",
    });

    // Unpaginated newest-first list returns every thread, even when created in the same millisecond.
    deepEqual(await app.call(thread_calls.calls.listThreads, {}), [third, second, first]);
    deepEqual(await app.call(thread_calls.calls.getThread, {thread_id: second.thread_id}), second);

    // Pagination arguments are rejected by EmptyInput.
    await rejects(
        () => app.call(thread_calls.calls.listThreads, {limit: 1} as never),
        CallInputError,
    );

    const threads_file = join(data_dir, "threads", "threads.jsonl");
    const lines = await readRawJsonlLines(threads_file);
    equal(lines.length, 3);
    for(const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        deepEqual(Object.keys(parsed).sort(), ["author_user_id", "body", "created_at", "thread_id", "title"]);
    }

    await stop();
    const restarted = await startDomainApplication(t, data_dir);
    deepEqual(await restarted.app.call(thread_calls.calls.listThreads, {}), [third, second, first]);
    deepEqual(await restarted.app.call(thread_calls.calls.getThread, {thread_id: first.thread_id}), first);
});

test("threads reads uncached JSONL records and appends without rewriting earlier lines", async (t) => {
    const data_dir = await createTemporaryDirectory(t);
    const {app} = await startDomainApplication(t, data_dir);

    const author = await app.call(user_calls.calls.resolveUser, {
        provider: "id",
        provider_account_id: "bob",
        display_name: "bob",
    });
    const created = await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "Initial",
        body: "Body",
    });
    const threads_file = join(data_dir, "threads", "threads.jsonl");
    const before_lines = await readRawJsonlLines(threads_file);
    equal(before_lines.length, 1);

    const older_external = {
        thread_id: "ext-older",
        author_user_id: author.user_id,
        title: "Older external",
        body: "Older body",
        created_at: "2020-01-01T00:00:00.000Z",
    };
    const newer_external = {
        thread_id: "ext-newer",
        author_user_id: author.user_id,
        title: "Newer external",
        body: "Newer body",
        created_at: "2099-01-01T00:00:00.000Z",
    };
    await appendFile(threads_file, `${JSON.stringify(older_external)}\n${JSON.stringify(newer_external)}\n`, "utf8");

    deepEqual(await app.call(thread_calls.calls.getThread, {thread_id: "ext-newer"}), newer_external);
    deepEqual(await app.call(thread_calls.calls.listThreads, {}), [newer_external, created, older_external]);

    await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "Appended later",
        body: "Still append-only",
    });
    const after_lines = await readRawJsonlLines(threads_file);
    equal(after_lines.length, 4);
    equal(after_lines[0], before_lines[0]);
    equal(after_lines[1], JSON.stringify(older_external));
    equal(after_lines[2], JSON.stringify(newer_external));
});
