import {defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";

export const ThreadSchema = schema({
    thread_id: "string",
    author_user_id: "string",
    title: "string",
    body: "string",
    created_at: "string",
});

export type ThreadRecord = typeof ThreadSchema.infer;

export const ThreadsCalls = defineComponentCalls("threads", {
    create: {
        input: schema({
            author_user_id: "string",
            title: "string",
            body: "string",
        }),
        output: ThreadSchema,
    },
    list: {
        input: schema({}),
        output: schema({
            threads: ThreadSchema.array(),
        }),
    },
    get: {
        input: schema({thread_id: "string"}),
        output: ThreadSchema.or("null"),
    },
});
