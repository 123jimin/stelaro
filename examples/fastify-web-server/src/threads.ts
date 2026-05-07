import {type as schema} from "arktype";
import {defineComponent, defineComponentCalls} from "@jiminp/peranto";

import {appendJsonl, readJsonl} from "./storage.ts";

const DATA_PATH = "data/threads.jsonl";

const ThreadSchema = schema({
    thread_id: "string",
    author_user_id: "string",
    title: "string",
    body: "string",
    created_at: "string",
});

type ThreadRecord = typeof ThreadSchema.infer;

export const ThreadsCalls = defineComponentCalls({
    id: "threads",
    calls: {
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
    },
});

export const ThreadsComponent = defineComponent({
    calls: ThreadsCalls,
    uses: [],
    handlers: {
        create: {
            async handle(_context, input) {
                const record: ThreadRecord = {
                    thread_id: crypto.randomUUID(),
                    author_user_id: input.author_user_id,
                    title: input.title,
                    body: input.body,
                    created_at: new Date().toISOString(),
                };
                await appendJsonl(DATA_PATH, record);
                return record;
            },
        },
        list: {
            async handle() {
                const threads = await readJsonl<ThreadRecord>(DATA_PATH);
                threads.sort((a, b) => b.created_at.localeCompare(a.created_at));
                return {threads};
            },
        },
        get: {
            async handle(_context, input) {
                const threads = await readJsonl<ThreadRecord>(DATA_PATH);
                return threads.find((t) => t.thread_id === input.thread_id) ?? null;
            },
        },
    },
});
