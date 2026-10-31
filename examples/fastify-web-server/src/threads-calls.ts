import {defineComponentCalls} from "@jiminp/stelaro";
import {type} from "arktype";

export const ThreadSchema = type({
    thread_id: "string",
    author_user_id: "string",
    title: "string",
    body: "string",
    created_at: "string",
});

export type ThreadRecord = typeof ThreadSchema.infer;

export const ThreadsCalls = defineComponentCalls("threads", {
    create: {
        input: type({
            author_user_id: "string",
            title: "string",
            body: "string",
        }),
        output: ThreadSchema,
    },
    list: {
        input: type({}),
        output: type({
            threads: ThreadSchema.array(),
        }),
    },
    get: {
        input: type({thread_id: "string"}),
        output: ThreadSchema.or("null"),
    },
});
