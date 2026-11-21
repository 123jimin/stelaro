import {randomUUID} from "node:crypto";

import {defineComponent, defineComponentCalls, UserFacingError} from "@jiminp/stelaro";
import {type} from "arktype";

import {
    appendJsonlRecord, createWriteQueue, IsoTimestamp, NonBlankString, NonEmptyString, readJsonlRecords,
} from "./storage.ts";
import {thread_calls} from "./threads.ts";
import {user_calls} from "./users.ts";

const COMMENTS_FILE = "comments.jsonl";

export const CommentRecord = type({
    "+": "reject",
    "comment_id": NonEmptyString,
    "thread_id": NonEmptyString,
    "author_user_id": NonEmptyString,
    "body": NonEmptyString,
    "created_at": IsoTimestamp,
});
export type CommentRecord = typeof CommentRecord.infer;

export const comment_calls = defineComponentCalls("comments", {
    createComment: {
        input: type({
            thread_id: NonEmptyString,
            author_user_id: NonEmptyString,
            body: NonBlankString,
        }),
        output: CommentRecord,
    },
    listCommentsByThread: {
        input: type({thread_id: NonEmptyString}),
        output: CommentRecord.array(),
    },
});

export const comments_component = defineComponent({
    calls: comment_calls,
    uses: [user_calls, thread_calls],
    state: () => ({enqueueWrite: createWriteQueue()}),
    handlers: {
        async createComment(context, input) {
            const [thread, author] = await Promise.all([
                context.call(thread_calls.calls.getThread, {thread_id: input.thread_id}),
                context.call(user_calls.calls.getUser, {user_id: input.author_user_id}),
            ]);
            if(thread == null) {
                throw new UserFacingError("Thread does not exist.");
            }
            if(author == null) {
                throw new UserFacingError("Author user does not exist.");
            }
            return context.state.enqueueWrite(async () => {
                const created: CommentRecord = {
                    comment_id: randomUUID(),
                    thread_id: thread.thread_id,
                    author_user_id: author.user_id,
                    body: input.body,
                    created_at: new Date().toISOString(),
                };
                await appendJsonlRecord(context.data, COMMENTS_FILE, CommentRecord, created);
                context.log.info("Created comment", {
                    comment_id: created.comment_id,
                    thread_id: created.thread_id,
                    author_user_id: created.author_user_id,
                });
                return created;
            });
        },
        async listCommentsByThread(context, input) {
            const comments = await readJsonlRecords(context.data, COMMENTS_FILE, CommentRecord);
            return comments
                .filter((comment) => comment.thread_id === input.thread_id)
                .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
        },
    },
});
