import {randomUUID} from "node:crypto";

import {defineComponent, defineComponentCalls, EmptyInput, UserFacingError} from "@jiminp/stelaro";
import {type} from "arktype";

import {
    appendJsonlRecord, createWriteQueue, IsoTimestamp, NonBlankString, NonEmptyString, readJsonlRecords, TrimmedNonEmptyString,
} from "./storage.ts";
import {user_calls} from "./users.ts";

const THREADS_FILE = "threads.jsonl";

export const ThreadRecord = type({
    "+": "reject",
    "thread_id": NonEmptyString,
    "author_user_id": NonEmptyString,
    "title": NonEmptyString,
    "body": NonEmptyString,
    "created_at": IsoTimestamp,
});
export type ThreadRecord = typeof ThreadRecord.infer;

export const thread_calls = defineComponentCalls("threads", {
    createThread: {
        input: type({
            author_user_id: NonEmptyString,
            title: TrimmedNonEmptyString,
            body: NonBlankString,
        }),
        output: ThreadRecord,
    },
    listThreads: {
        input: EmptyInput,
        output: ThreadRecord.array(),
    },
    getThread: {
        input: type({thread_id: NonEmptyString}),
        output: ThreadRecord.or("null"),
    },
});

export const threads_component = defineComponent({
    calls: thread_calls,
    uses: [user_calls],
    state: () => ({enqueueWrite: createWriteQueue()}),
    handlers: {
        async createThread(context, input) {
            const author = await context.call(user_calls.calls.getUser, {user_id: input.author_user_id});
            if(author == null) {
                throw new UserFacingError("Author user does not exist.");
            }
            return context.state.enqueueWrite(async () => {
                const created: ThreadRecord = {
                    thread_id: randomUUID(),
                    author_user_id: author.user_id,
                    title: input.title,
                    body: input.body,
                    created_at: new Date().toISOString(),
                };
                await appendJsonlRecord(context.data, THREADS_FILE, ThreadRecord, created);
                context.log.info("Created thread", {thread_id: created.thread_id, author_user_id: created.author_user_id});
                return created;
            });
        },
        async listThreads(context) {
            const threads = await readJsonlRecords(context.data, THREADS_FILE, ThreadRecord);
            // Reverse before sorting so threads appended in the same millisecond stay newest-first.
            return threads.reverse().sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
        },
        async getThread(context, input) {
            const threads = await readJsonlRecords(context.data, THREADS_FILE, ThreadRecord);
            return threads.find((thread) => thread.thread_id === input.thread_id) ?? null;
        },
    },
});
