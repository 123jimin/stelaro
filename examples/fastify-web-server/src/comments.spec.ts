import {deepEqual, equal, rejects} from "node:assert/strict";
import {appendFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";

import {UserFacingError} from "@jiminp/stelaro";

import {comment_calls} from "./comments.ts";
import {createTemporaryDirectory, readRawJsonlLines, startDomainApplication} from "./test-util.ts";
import {thread_calls} from "./threads/index.ts";
import {user_calls} from "./users.ts";

test("comments creates immutable creation-ordered comments per thread and persists across restarts", async (t) => {
    const data_dir = await createTemporaryDirectory(t);
    const {app, stop} = await startDomainApplication(t, data_dir);

    // Immutability: only create and list exist on the comment call surface.
    deepEqual(Object.keys(comment_calls.calls).sort(), ["createComment", "listCommentsByThread"]);

    const author = await app.call(user_calls.calls.resolveUser, {
        provider: "id",
        provider_account_id: "alice",
        display_name: "alice",
    });
    const thread_a = await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "Thread A",
        body: "Body A",
    });
    const thread_b = await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "Thread B",
        body: "Body B",
    });

    await rejects(
        () => app.call(comment_calls.calls.createComment, {
            thread_id: "missing-thread",
            author_user_id: author.user_id,
            body: "No thread",
        }),
        UserFacingError,
    );
    await rejects(
        () => app.call(comment_calls.calls.createComment, {
            thread_id: thread_a.thread_id,
            author_user_id: "missing-user",
            body: "No user",
        }),
        UserFacingError,
    );

    const a_first = await app.call(comment_calls.calls.createComment, {
        thread_id: thread_a.thread_id,
        author_user_id: author.user_id,
        body: "First on A",
    });
    const b_only = await app.call(comment_calls.calls.createComment, {
        thread_id: thread_b.thread_id,
        author_user_id: author.user_id,
        body: "Only on B",
    });
    const a_second = await app.call(comment_calls.calls.createComment, {
        thread_id: thread_a.thread_id,
        author_user_id: author.user_id,
        body: "Second on A",
    });
    const a_third = await app.call(comment_calls.calls.createComment, {
        thread_id: thread_a.thread_id,
        author_user_id: author.user_id,
        body: "Third on A",
    });

    deepEqual(await app.call(comment_calls.calls.listCommentsByThread, {thread_id: thread_a.thread_id}), [
        a_first,
        a_second,
        a_third,
    ]);
    deepEqual(await app.call(comment_calls.calls.listCommentsByThread, {thread_id: thread_b.thread_id}), [b_only]);
    deepEqual(await app.call(comment_calls.calls.listCommentsByThread, {thread_id: "no-comments"}), []);

    const comments_file = join(data_dir, "comments", "comments.jsonl");
    const lines = await readRawJsonlLines(comments_file);
    equal(lines.length, 4);
    for(const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        deepEqual(Object.keys(parsed).sort(), ["author_user_id", "body", "comment_id", "created_at", "thread_id"]);
    }

    await stop();
    const restarted = await startDomainApplication(t, data_dir);
    deepEqual(await restarted.app.call(comment_calls.calls.listCommentsByThread, {thread_id: thread_a.thread_id}), [
        a_first,
        a_second,
        a_third,
    ]);
    deepEqual(await restarted.app.call(comment_calls.calls.listCommentsByThread, {thread_id: thread_b.thread_id}), [b_only]);
});

test("comments reads uncached records from disk and appends without rewriting earlier lines", async (t) => {
    const data_dir = await createTemporaryDirectory(t);
    const {app} = await startDomainApplication(t, data_dir);

    const author = await app.call(user_calls.calls.resolveUser, {
        provider: "id",
        provider_account_id: "bob",
        display_name: "bob",
    });
    const thread = await app.call(thread_calls.calls.createThread, {
        author_user_id: author.user_id,
        title: "Discussion",
        body: "Start",
    });
    const created = await app.call(comment_calls.calls.createComment, {
        thread_id: thread.thread_id,
        author_user_id: author.user_id,
        body: "First comment",
    });
    const comments_file = join(data_dir, "comments", "comments.jsonl");
    const before_lines = await readRawJsonlLines(comments_file);
    equal(before_lines.length, 1);

    const external_comment = {
        comment_id: "ext-comment-1",
        thread_id: thread.thread_id,
        author_user_id: author.user_id,
        body: "External comment",
        created_at: "2099-01-01T00:00:00.000Z",
    };
    await appendFile(comments_file, `${JSON.stringify(external_comment)}\n`, "utf8");

    deepEqual(await app.call(comment_calls.calls.listCommentsByThread, {thread_id: thread.thread_id}), [
        created,
        external_comment,
    ]);

    const second = await app.call(comment_calls.calls.createComment, {
        thread_id: thread.thread_id,
        author_user_id: author.user_id,
        body: "Appended later",
    });
    const after_lines = await readRawJsonlLines(comments_file);
    equal(after_lines.length, 3);
    equal(after_lines[0], before_lines[0]);
    equal(after_lines[1], JSON.stringify(external_comment));
    deepEqual(JSON.parse(after_lines[2]!), second);
});
