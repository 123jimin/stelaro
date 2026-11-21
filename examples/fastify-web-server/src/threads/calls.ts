import {defineComponentCalls, EmptyInput} from "@jiminp/stelaro";
import {type} from "arktype";

import {IsoTimestamp, NonBlankString, NonEmptyString, TrimmedNonEmptyString} from "../storage.ts";

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
